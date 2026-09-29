export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, refundUsage, getRemainingUsage, resolveLocalDate, ORG_BUDGET_MSG } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';

const DAILY_LIMIT = 10;
const MAX_IMAGES = 6;

// So the page can show "X scans left today" before the user has even
// taken a photo, not just after their first attempt.
export async function GET(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const remaining = await getRemainingUsage(app, authCheck.uid, 'scan-and-go', DAILY_LIMIT, resolveLocalDate(req));
  return NextResponse.json({ remaining, dailyLimit: DAILY_LIMIT });
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const uid = authCheck.uid;

  // Tracked so the outer catch only ever refunds a count it actually
  // incremented THIS request — not e.g. a previous request's usage if this
  // one fails before ever reaching checkAndIncrementUsage.
  let usageApp: ReturnType<typeof getAdminApp> = null;

  try {
    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured. Add it in Admin → Integrations.' }, { status: 500 });
    }

    const appForAccess = getAdminApp();
    if (!appForAccess) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    // Unlike its sibling AI routes (analyze-food, meal-ideas), this endpoint
    // only ever checked "is this a real logged-in user" + a daily count —
    // never membership/plan access. Any signed-in user, member or not, got
    // 10 free GPT-4o-mini vision calls/day (the most expensive AI call type
    // in the app) indefinitely.
    const access = await verifyFeatureAccess(appForAccess, uid, 'scan-and-go');
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

    const { dataUrls, experience, fitnessGoal, limitations } = await req.json() as {
      dataUrls?: string[]; experience?: string; fitnessGoal?: string; limitations?: string;
    };
    if (!dataUrls || !Array.isArray(dataUrls) || dataUrls.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }
    if (dataUrls.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Maximum ${MAX_IMAGES} photos` }, { status: 400 });
    }
    // Trust the caller's own MIME type instead of assuming/hardcoding one —
    // still validated as an actual image data URL so this can't be used to
    // smuggle an arbitrary URL into the OpenAI request.
    if (!dataUrls.every((u) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(u))) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    }
    // Only the image COUNT was capped, not the size of each one — up to 6
    // arbitrarily large data URLs could inflate request body/memory and
    // OpenAI vision billing before the daily-count limit below ever kicks
    // in. ~8MB of base64 per image is a generous ceiling for a phone photo.
    if (dataUrls.some((u) => u.length > 8_000_000)) {
      return NextResponse.json({ error: 'One or more images is too large' }, { status: 400 });
    }

    const app = appForAccess;
    const usage = await checkAndIncrementUsage(app, uid, 'scan-and-go', DAILY_LIMIT, resolveLocalDate(req));
    if (!usage.allowed) {
      return NextResponse.json({ error: usage.orgLimitReached ? ORG_BUDGET_MSG : `Daily limit reached (${DAILY_LIMIT}/day). Try again tomorrow.`, remaining: 0 }, { status: 429 });
    }
    usageApp = app;

    // Machine identification is the whole product here, and the mini model
    // gets it wrong on anything but the obvious (a hack squat came back as
    // "leg press + leg extension"). Vision-heavy routes get a stronger
    // model; ten scans a day keeps the cost trivial.
    const model = process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1';
    const openai = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });

    // A single-day, ephemeral workout only — deliberately NOT a multi-week
    // program. Scoping it to "today" is what makes freeform AI exercise
    // selection acceptable here: a bad pick costs one session, not weeks of
    // progression built on it (see Build My Own Program, removed earlier
    // for exactly that risk at program scale).
    const prompt = `You are a certified strength coach building a SINGLE day's workout from photos of whatever equipment is physically visible in them.

Athlete context:
- Experience level: ${experience || 'beginner'}
- Goal: ${fitnessGoal || 'general fitness'}
- Injuries/limitations to strictly avoid aggravating: ${limitations || 'none reported'}

Work in two passes.

PASS 1 - LOOK. For each photo, describe in "observations" what you can literally see: the frame shape, where the footplate or seat is, the angle of the sled or backrest, handles, weight stack or plate horns, cables, pads. Do this before naming anything.

PASS 2 - NAME. Only then name each piece of equipment, with a confidence of "high", "medium" or "low". List ONLY items you can actually see. One machine in the photo means one item in the list. Never add a machine because it is usually found next to the one you see, and never pad the list.

Machines that are routinely confused. Use the features to tell them apart:
- Hack squat: you stand, back against an angled pad, shoulders under pads, feet on a plate below you, sled travels on rails. Plate-loaded.
- 45-degree leg press: you SIT low, feet on a large plate ABOVE you at an angle, you push the plate away. Plate-loaded.
- Seated / horizontal leg press: seated upright, footplate in front at chest height, usually a weight stack.
- Smith machine: a barbell fixed on vertical rails with hooks, no footplate.
- Leg extension: seated, a padded roller in front of the shins, you kick up. Weight stack.
- Seated leg curl: seated, roller behind the calves, you pull down. Lying leg curl: face down.
- Pendulum squat: standing, back pad on an arm that swings from a pivot behind you.
- Belt squat: standing on a platform, load hangs from a belt.
If two of these fit, choose the one whose features you actually observed and mark confidence "medium". If you cannot tell, say "unidentified machine" with confidence "low" rather than guessing a popular name.

Then build the workout:
1. Every exercise MUST use bodyweight or one item from your equipment list with confidence high or medium. Name it in "equipmentUsed" exactly as it appears in the list, or "bodyweight". Never use an item you did not list, and never pick an exercise because it is popular if nothing in the photos supports it.
2. Do NOT force variety across muscle groups. If the photos show one leg machine, build a genuinely leg-focused session: that machine's main movement, a second variation of it (foot position, tempo, rep range), plus bodyweight leg, glute and calf work. A single-focus day from limited equipment is the correct result.
3. Respect experience level and goal, and NEVER include an exercise that would aggravate a stated limitation; substitute a safer alternative.
4. For cardio machines used as INTERVALS (sets > 1): "reps" is a duration in SECONDS per round, written as a plain number, 15 to 60. Only use a single set with reps in minutes for one continuous steady-state block.

Return ONLY valid JSON with this exact structure, no markdown fences:
{
  "observations": ["one short sentence per photo about what is physically visible"],
  "equipment": [ { "name": "string", "confidence": "high" | "medium" | "low" } ],
  "ignoredNote": "short note about anything irrelevant in the photos, or empty string",
  "exercises": [
    { "name": "string", "equipmentUsed": "string", "sets": number, "reps": "string or number", "restSeconds": number, "notes": "short form cue" }
  ]
}`;

    const imageContent = dataUrls.slice(0, MAX_IMAGES).map((url) => ({
      type: 'image_url' as const,
      // 'high' detail (vs. the previous 'low', a single downscaled 512px
      // tile) is what actually fixed misidentified equipment — a leg press
      // and a leg extension machine look meaningfully different but were
      // getting blurred together at low resolution, and the model would
      // then fall back on generic/popular exercises (reported: recommending
      // tricep extensions from a photo of leg machines) instead of what was
      // actually there. Worth the extra tokens given this is capped at 6
      // images and a low daily limit already.
      image_url: { url, detail: 'high' as const },
    }));

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1500,
      // Forces the model to emit strictly valid JSON instead of relying on
      // the prompt's "no markdown fences" instruction, which the model
      // doesn't always follow exactly — a stray trailing comma or unescaped
      // character in free-text output was breaking the naive regex-extract
      // + JSON.parse this used to rely on ("Expected ',' or '}'..." errors
      // reported in production).
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageContent],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    let parsed: {
      equipmentDetected?: string[]; ignoredNote?: string;
      equipment?: { name?: string; confidence?: string }[];
      exercises?: { name: string; equipmentUsed?: string; sets: number; reps: string | number; restSeconds: number; notes?: string }[];
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[scan-and-go] Model returned unparseable JSON:', content);
      await refundUsage(app, uid, 'scan-and-go', resolveLocalDate(req));
      return NextResponse.json({ error: "Couldn't read the AI's response — try again.", remaining: usage.remaining + 1 }, { status: 502 });
    }

    // Shape-check every exercise before it reaches the session player, which
    // assumes numeric sets/rest and a string name. json_object mode guarantees
    // parseable JSON, not the right fields — a model that returned
    // sets: "3-4" or omitted restSeconds produced NaN timers in the UI.
    const num = (v: unknown, fallback: number, max: number) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
    };
    // Equipment the model is at least fairly sure of. Low-confidence guesses
    // and "unidentified machine" are dropped here rather than shown as fact.
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const equipmentDetected = (Array.isArray(parsed.equipment) ? parsed.equipment : [])
      .filter((e): e is { name: string; confidence?: string } => !!e && typeof e.name === 'string' && e.name.trim().length > 0)
      .filter((e) => e.confidence !== 'low' && !/unidentified/i.test(e.name))
      .map((e) => e.name.trim().slice(0, 60))
      .filter((name, i, arr) => arr.findIndex((x) => norm(x) === norm(name)) === i)
      .slice(0, 30);
    const allowed = new Set(equipmentDetected.map(norm));
    const usesDetected = (eq: string | undefined) => {
      const n = norm(eq ?? 'bodyweight');
      if (!n || n === 'bodyweight' || n === 'none') return true;
      // "leg press" against "45 degree leg press machine": either contains the other.
      return [...allowed].some((a) => a === n || a.includes(n) || n.includes(a));
    };
    const exercises = (Array.isArray(parsed.exercises) ? parsed.exercises : [])
      .filter((e): e is NonNullable<typeof e> => !!e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim().length > 0)
      // The prompt says it; this enforces it. An exercise on a machine that
      // is not in the photo is exactly the failure this route exists to avoid.
      .filter((e) => usesDetected(typeof e.equipmentUsed === 'string' ? e.equipmentUsed : undefined))
      .slice(0, 12)
      .map((e) => ({
        name: e.name.trim().slice(0, 120),
        equipmentUsed: typeof e.equipmentUsed === 'string' ? e.equipmentUsed.slice(0, 120) : undefined,
        sets: Math.max(1, Math.round(num(e.sets, 3, 10))),
        reps: typeof e.reps === 'number' ? Math.max(1, Math.round(num(e.reps, 10, 100))) : String(e.reps ?? '10').slice(0, 20),
        restSeconds: Math.round(num(e.restSeconds, 60, 600)),
        notes: typeof e.notes === 'string' ? e.notes.slice(0, 300) : undefined,
      }));

    if (exercises.length === 0) {
      await refundUsage(app, uid, 'scan-and-go', resolveLocalDate(req));
      return NextResponse.json({ error: "Couldn't identify any usable equipment or exercises from those photos — try again with clearer shots.", remaining: usage.remaining + 1 }, { status: 422 });
    }

    return NextResponse.json({
      equipmentDetected,
      ignoredNote: typeof parsed.ignoredNote === 'string' ? parsed.ignoredNote.slice(0, 300) : '',
      exercises,
      remaining: usage.remaining,
    });
  } catch (err: unknown) {
    console.error('[scan-and-go] Error:', err);
    let remaining: number | undefined;
    if (usageApp) {
      await refundUsage(usageApp, uid, 'scan-and-go', resolveLocalDate(req));
      remaining = await getRemainingUsage(usageApp, uid, 'scan-and-go', DAILY_LIMIT, resolveLocalDate(req));
    }
    // Never the provider's message: it names models and quota state that are
    // ours, not the member's, and the same route already logged it above.
    return NextResponse.json({ error: 'Scan failed. Try again in a moment.', remaining }, { status: 500 });
  }
}
