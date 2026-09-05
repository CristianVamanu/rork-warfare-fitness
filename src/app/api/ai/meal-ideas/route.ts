export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, refundUsage, resolveLocalDate, ORG_BUDGET_MSG } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';
import { z } from 'zod';

// What the client renders. Anything the model adds is stripped; anything it
// gets wrong (a string calorie count, a missing name) is rejected rather than
// passed through to a UI that assumes numbers.
const grams = z.coerce.number().finite().min(0).max(1000).catch(0);
const MealIdea = z.object({
  name: z.string().trim().min(1).max(120),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).catch('snack'),
  description: z.string().trim().max(500).catch(''),
  instructions: z.array(z.string().trim().max(300)).max(12).catch([]),
  calories: z.coerce.number().finite().min(0).max(5000),
  protein: grams, carbs: grams, fat: grams,
}).strip();
const MealIdeas = z.object({ meals: z.array(MealIdea).max(6) });

const DEFAULT_DAILY_LIMIT = 15;

const SYSTEM_PROMPT = `You are a practical home cook and nutrition coach. The user tells you what
ingredients they have available, and you suggest real meals they can actually make with
mostly (not necessarily exclusively) those ingredients — assume basic pantry staples
(salt, pepper, oil, common spices) are always available even if not listed.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "meals": [
    {
      "name": "Meal name",
      "mealType": "breakfast" | "lunch" | "dinner" | "snack",
      "description": "1-2 sentence description",
      "instructions": ["step 1", "step 2", "step 3"],
      "calories": <number>,
      "protein": <number, grams>,
      "carbs": <number, grams>,
      "fat": <number, grams>
    }
  ]
}

Suggest exactly 3 meals, varied in type where sensible. Keep instructions short and
practical (3-6 steps). Estimate macros for a realistic single-serving portion.`;

export async function POST(req: NextRequest) {
  // Verifies the caller's own login token instead of trusting a
  // client-supplied uid — see analyze-food/route.ts for why this matters.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const uid = authCheck.uid;
  // Set only once a turn has actually been counted, so the refund in the
  // catch below can't credit a turn that was never charged.
  let usageApp: ReturnType<typeof getAdminApp> = null;

  try {
    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add it in Admin → Integrations.' },
        { status: 500 }
      );
    }

    const { ingredients } = await req.json() as { ingredients?: string };
    if (!ingredients?.trim()) return NextResponse.json({ error: 'Tell me what you have' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    // The PaywallGate on this tool client-side ('meal-planner') was
    // UI-only — this endpoint never checked membership/plan access, only
    // a daily count, so anyone with a valid token could call it directly
    // regardless of plan. See verifyFeatureAccess.
    const access = await verifyFeatureAccess(app, uid, 'meal-planner');
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

    const cfgSnap = await getAdminDb(app).collection('system').doc('config').get();
    const dailyLimit = (cfgSnap.data()?.mealIdeasDailyLimit as number) || DEFAULT_DAILY_LIMIT;
    const usage = await checkAndIncrementUsage(app, uid, 'meal-ideas', dailyLimit, resolveLocalDate(req));
    if (!usage.allowed) {
      return NextResponse.json(
        { error: usage.orgLimitReached ? ORG_BUDGET_MSG : `Daily limit reached (${dailyLimit}/day). Try again tomorrow.` },
        { status: 429 }
      );
    }
    usageApp = app;

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 900,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `I have: ${ingredients.trim()}` },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    let raw: unknown;
    try { raw = JSON.parse(content); } catch { raw = null; }
    const parsed = MealIdeas.safeParse(raw);
    if (!parsed.success || parsed.data.meals.length === 0) {
      console.error('[meal-ideas] Unusable model output:', content.slice(0, 300));
      await refundUsage(app, uid, 'meal-ideas', resolveLocalDate(req)).catch(() => {});
      return NextResponse.json({ error: "Couldn't come up with ideas for that — try listing a few more ingredients." }, { status: 502 });
    }
    return NextResponse.json({ meals: parsed.data.meals });
  } catch (err) {
    console.error('[meal-ideas] Error:', err);
    // Refund the turn on a provider failure, and never echo the provider's
    // message — it names models and quota state that aren't the member's.
    if (usageApp) await refundUsage(usageApp, uid, 'meal-ideas', resolveLocalDate(req)).catch(() => {});
    return NextResponse.json({ error: 'Meal ideas are unavailable right now. Try again in a moment.' }, { status: 502 });
  }
}
