export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { checkAndIncrementUsage } from '@/lib/usageLimit';

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
  try {
    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add it in Admin → Integrations.' },
        { status: 500 }
      );
    }

    const { ingredients, uid } = await req.json() as { ingredients?: string; uid?: string };
    if (!ingredients?.trim()) return NextResponse.json({ error: 'Tell me what you have' }, { status: 400 });
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    const cfgSnap = await getAdminDb(app).collection('system').doc('config').get();
    const dailyLimit = (cfgSnap.data()?.mealIdeasDailyLimit as number) || DEFAULT_DAILY_LIMIT;
    const usage = await checkAndIncrementUsage(app, uid, 'meal-ideas', dailyLimit);
    if (!usage.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached (${dailyLimit}/day). Try again tomorrow.` },
        { status: 429 }
      );
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey });

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
    const parsed = JSON.parse(content);
    return NextResponse.json({ meals: parsed.meals ?? [] });
  } catch (err) {
    console.error('[meal-ideas] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate meal ideas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
