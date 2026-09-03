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

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey });

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

Instructions:
1. Identify every piece of exercise equipment actually visible across the photos (e.g. barbell, dumbbells, kettlebells, pull-up bar, bench, leg press machine, leg extension machine, cable machine, squat rack). Look carefully — a leg press and a leg extension machine are different machines with different silhouettes; don't guess generically.
2. Ignore anything in the photos that isn't exercise equipment (furniture, people, walls, etc.) — do not mention it as equipment, but you may note it was ignored.
3. Every exercise MUST use either bodyweight or a specific item from the equipment you actually identified — name which one in "equipmentUsed" for each exercise (or "bodyweight"). Never invent equipment that wasn't in a photo, and never pick an exercise just because it's a normally-popular one if nothing in the photos supports it.
4. Do NOT force variety across muscle groups if the equipment doesn't support it. If the photos only show leg machines, build a genuinely leg-focused session (that machine's primary movement, a different rep/tempo variation of it, plus bodyweight leg/glute/calf accessory work) instead of padding in unrelated upper-body or arm exercises just to look "balanced" — a single-focus day from limited equipment is the correct, expected result, not a flaw to cover up.
5. Respect the athlete's experience level and goal, and NEVER include an exercise that would aggravate a stated limitation/injury — substitute a safer alternative instead.
6. Only balance across muscle groups when the detected equipment actually allows it.
7. For cardio machines (stationary bike, treadmill, rower, elliptical, etc.) used as INTERVALS (sets > 1, e.g. "8 rounds of sprints"): the "reps" field is a duration in SECONDS per round — write it as a plain number of seconds (e.g. "30" or "45"), never minutes. Real high-intensity intervals are 15-60 seconds of work per round; multiple rounds of several MINUTES each is not physiologically realistic and must never be produced. Only use a single set (sets: 1) with reps expressed in minutes for genuine steady-state cardio (one continuous block, e.g. "20 minute steady ride").

Return ONLY valid JSON with this exact structure, no markdown fences:
{
  "equipmentDetected": ["string", ...],
  "ignoredNote": "short note about anything irrelevant in the photos, or empty string if nothing to mention",
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
      exercises?: { name: string; equipmentUsed?: string; sets: number; reps: string | number; restSeconds: number; notes?: string }[];
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[scan-and-go] Model returned unparseable JSON:', content);
      await refundUsage(app, uid, 'scan-and-go', resolveLocalDate(req));
      return NextResponse.json({ error: "Couldn't read the AI's response — try again.", remaining: usage.remaining + 1 }, { status: 502 });
    }

    if (!parsed.exercises || parsed.exercises.length === 0) {
      await refundUsage(app, uid, 'scan-and-go', resolveLocalDate(req));
      return NextResponse.json({ error: "Couldn't identify any usable equipment or exercises from those photos — try again with clearer shots.", remaining: usage.remaining + 1 }, { status: 422 });
    }

    return NextResponse.json({
      equipmentDetected: parsed.equipmentDetected ?? [],
      ignoredNote: parsed.ignoredNote ?? '',
      exercises: parsed.exercises,
      remaining: usage.remaining,
    });
  } catch (err: unknown) {
    console.error('[scan-and-go] Error:', err);
    let remaining: number | undefined;
    if (usageApp) {
      await refundUsage(usageApp, uid, 'scan-and-go', resolveLocalDate(req));
      remaining = await getRemainingUsage(usageApp, uid, 'scan-and-go', DAILY_LIMIT, resolveLocalDate(req));
    }
    const message = err instanceof Error ? err.message : 'Scan failed';
    return NextResponse.json({ error: message, remaining }, { status: 500 });
  }
}
