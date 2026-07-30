export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, refundUsage } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';

const DAILY_LIMIT = 10;
const MAX_IMAGES = 6;

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

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    const usage = await checkAndIncrementUsage(app, uid, 'scan-and-go', DAILY_LIMIT);
    if (!usage.allowed) {
      return NextResponse.json({ error: `Daily limit reached (${DAILY_LIMIT}/day). Try again tomorrow.` }, { status: 429 });
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
1. Identify every piece of exercise equipment actually visible across the photos (e.g. barbell, dumbbells, kettlebells, pull-up bar, bench, resistance bands, cable machine, squat rack). Bodyweight is always available even with no equipment.
2. Ignore anything in the photos that isn't exercise equipment (furniture, people, walls, etc.) — do not mention it as equipment, but you may note it was ignored.
3. Build ONE day's workout (6-8 exercises) using ONLY the equipment you actually identified plus bodyweight. Never invent equipment that wasn't in a photo.
4. Respect the athlete's experience level and goal, and NEVER include an exercise that would aggravate a stated limitation/injury — substitute a safer alternative instead.
5. Balance the session across muscle groups (don't repeat the same movement pattern back to back).

Return ONLY valid JSON with this exact structure, no markdown fences:
{
  "equipmentDetected": ["string", ...],
  "ignoredNote": "short note about anything irrelevant in the photos, or empty string if nothing to mention",
  "exercises": [
    { "name": "string", "sets": number, "reps": "string or number", "restSeconds": number, "notes": "short form cue" }
  ]
}`;

    const imageContent = dataUrls.slice(0, MAX_IMAGES).map((url) => ({
      type: 'image_url' as const,
      image_url: { url, detail: 'low' as const },
    }));

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1200,
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
      exercises?: { name: string; sets: number; reps: string | number; restSeconds: number; notes?: string }[];
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[scan-and-go] Model returned unparseable JSON:', content);
      await refundUsage(app, uid, 'scan-and-go');
      return NextResponse.json({ error: "Couldn't read the AI's response — try again." }, { status: 502 });
    }

    if (!parsed.exercises || parsed.exercises.length === 0) {
      await refundUsage(app, uid, 'scan-and-go');
      return NextResponse.json({ error: "Couldn't identify any usable equipment or exercises from those photos — try again with clearer shots." }, { status: 422 });
    }

    return NextResponse.json({
      equipmentDetected: parsed.equipmentDetected ?? [],
      ignoredNote: parsed.ignoredNote ?? '',
      exercises: parsed.exercises,
    });
  } catch (err: unknown) {
    console.error('[scan-and-go] Error:', err);
    if (usageApp) await refundUsage(usageApp, uid, 'scan-and-go');
    const message = err instanceof Error ? err.message : 'Scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
