export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, getRemainingUsage, refundUsage, resolveConfiguredDailyLimit } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';

const DEFAULT_DAILY_ANALYSIS_LIMIT = 20;
const resolveDailyLimit = (app: NonNullable<ReturnType<typeof getAdminApp>>) =>
  resolveConfiguredDailyLimit(app, 'foodAnalysisDailyLimit', DEFAULT_DAILY_ANALYSIS_LIMIT);

// So the page can show "X left today" before the user even takes a photo.
export async function GET(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const dailyLimit = await resolveDailyLimit(app);
  const remaining = await getRemainingUsage(app, authCheck.uid, 'food-analysis', dailyLimit);
  return NextResponse.json({ remaining, dailyLimit });
}

export async function POST(req: NextRequest) {
  // Verifies the caller's own Firebase login token rather than trusting a
  // client-supplied uid — without this, anyone could send a fresh random uid
  // on every request and bypass the per-user daily rate limit entirely,
  // running unlimited OpenAI calls on this app's bill.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const uid = authCheck.uid;

  // Tracked so the catch block only ever refunds a count it actually
  // incremented THIS request.
  let usageApp: ReturnType<typeof getAdminApp> = null;

  try {
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

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    const dailyLimit = await resolveDailyLimit(app);
    const usage = await checkAndIncrementUsage(app, uid, 'food-analysis', dailyLimit);
    if (!usage.allowed) {
      return NextResponse.json(
        { error: `Daily analysis limit reached (${dailyLimit}/day). Try again tomorrow.`, remaining: 0 },
        { status: 429 }
      );
    }
    usageApp = app;

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
    return NextResponse.json({ ...nutrition, remaining: usage.remaining });
  } catch (err: unknown) {
    console.error('[analyze-food] Error:', err);
    let remaining: number | undefined;
    if (usageApp) {
      await refundUsage(usageApp, uid, 'food-analysis');
      const dailyLimit = await resolveDailyLimit(usageApp);
      remaining = await getRemainingUsage(usageApp, uid, 'food-analysis', dailyLimit);
    }
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message, remaining }, { status: 500 });
  }
}
