export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyUser } from '@/lib/verifyUser';
import { checkAndIncrementDailyLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyUser(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const limit = await checkAndIncrementDailyLimit(check.uid, 'foodScans');
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Daily food scan limit reached (${limit.limit}/day). Try again tomorrow.` },
        { status: 429 }
      );
    }

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[analyze-food] OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add it in Admin → Integrations.' },
        { status: 500 }
      );
    }

    const { base64Image } = await req.json();
    if (!base64Image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this food image and return a JSON object with nutritional information.
Return ONLY valid JSON with this exact structure:
{
  "name": "food name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number
}
All values should be in grams (except calories in kcal). Estimate for a typical serving size.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'low' },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const nutrition = JSON.parse(jsonMatch[0]);
    return NextResponse.json(nutrition);
  } catch (err: unknown) {
    console.error('[analyze-food] Error:', err);
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
