export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, getRemainingUsage, refundUsage, resolveConfiguredDailyLimit, resolveLocalDate, ORG_BUDGET_MSG } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';
import { z } from 'zod';

// Bounds are deliberately generous — a whole pizza is ~2,500 kcal — but
// finite. The point is to reject nonsense, not to second-guess the model.
const grams = z.coerce.number().finite().min(0).max(1000).catch(0);
const NutritionEstimate = z.object({
  name: z.string().trim().min(1).max(120).catch('Meal'),
  calories: z.coerce.number().finite().min(0).max(5000),
  protein: grams,
  carbs: grams,
  fat: grams,
}).strip();

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
  const remaining = await getRemainingUsage(app, authCheck.uid, 'food-analysis', dailyLimit, resolveLocalDate(req));
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
    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    // The PaywallGate on this tool client-side ('nutrition-ai') was
    // UI-only — this endpoint never checked membership/plan access, only
    // a daily count, so anyone with a valid token could call it directly
    // regardless of plan. See verifyFeatureAccess.
    const access = await verifyFeatureAccess(app, uid, 'nutrition-ai');
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[analyze-food] OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add it in Admin → Integrations.' },
        { status: 500 }
      );
    }

    const { base64Image } = await req.json();
    if (!base64Image || typeof base64Image !== 'string') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    // Unlike scan-and-go (which validates a data: URL + image count cap),
    // this endpoint used to accept a raw base64 string with no shape or
    // size check at all — a non-image or oversized payload would still be
    // wrapped into a data URL and sent to OpenAI, wasting a full model call
    // (and its cost) before failing, ahead of the daily-count limit below
    // ever having a chance to matter. A plain length cap on the base64
    // string (~6MB of decoded image data) is enough here since this route
    // always assumes JPEG rather than trusting a caller-supplied MIME type.
    if (!/^[A-Za-z0-9+/]+=*$/.test(base64Image) || base64Image.length > 8_000_000) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    }

    const dailyLimit = await resolveDailyLimit(app);
    const usage = await checkAndIncrementUsage(app, uid, 'food-analysis', dailyLimit, resolveLocalDate(req));
    if (!usage.allowed) {
      return NextResponse.json(
        { error: usage.orgLimitReached ? ORG_BUDGET_MSG : `Daily analysis limit reached (${dailyLimit}/day). Try again tomorrow.`, remaining: 0 },
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

    // The model's JSON used to go straight back to the client, and from
    // there straight into logMealAction → Firestore, with no shape check at
    // all: a negative calorie count, "unknown" where a number belongs, or a
    // stray extra key all flowed through into the events collection and
    // then into statsCache arithmetic. This is an *estimate* from a vision
    // model; the one thing that must be true about it is that it is a set
    // of finite, non-negative numbers in a plausible range. Unknown keys are
    // stripped, numbers are coerced (the model sometimes quotes them) and
    // clamped, and anything that still fails is a hard error — which the
    // catch below turns into a refunded usage credit rather than a charge
    // for garbage.
    const parsed = NutritionEstimate.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      throw new Error('AI returned an unusable estimate — please try another photo');
    }
    return NextResponse.json({ ...parsed.data, remaining: usage.remaining });
  } catch (err: unknown) {
    console.error('[analyze-food] Error:', err);
    let remaining: number | undefined;
    if (usageApp) {
      await refundUsage(usageApp, uid, 'food-analysis', resolveLocalDate(req));
      const dailyLimit = await resolveDailyLimit(usageApp);
      remaining = await getRemainingUsage(usageApp, uid, 'food-analysis', dailyLimit, resolveLocalDate(req));
    }
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message, remaining }, { status: 500 });
  }
}
