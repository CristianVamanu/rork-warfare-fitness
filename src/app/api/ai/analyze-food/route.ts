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
const per100 = z.coerce.number().finite().min(0).max(100).catch(0);
const NutritionEstimate = z.object({
  name: z.string().trim().min(1).max(120).catch('Meal'),
  calories: z.coerce.number().finite().min(0).max(5000),
  protein: grams,
  carbs: grams,
  fat: grams,
  // The portion the estimate covers, e.g. "500 ml bottle" or "1 plate (~350 g)".
  portion: z.string().trim().min(1).max(60).catch('1 serving'),
  // Not z.coerce: Boolean('false') is true.
  packaged: z.preprocess((v) => (typeof v === 'string' ? ['true', 'yes', '1'].includes(v.trim().toLowerCase()) : v === true), z.boolean()).catch(false),
}).strip();

/**
 * What the model is asked for. Guessing a portion's TOTALS in one go was where
 * the big misses came from (a 40 g bag of crisps logged as 1,000 kcal): the
 * nutrition density of a food is well known and stable, the weight is the
 * uncertain part. So the model reports per-100 g values (from the label when
 * it can read one) and the weight separately, and the totals are computed
 * here, then checked against the 4/4/9 energy rule.
 */
const ModelEstimate = z.object({
  name: z.string().trim().min(1).max(120).catch('Meal'),
  packaged: z.preprocess((v) => (typeof v === 'string' ? ['true', 'yes', '1'].includes(v.trim().toLowerCase()) : v === true), z.boolean()).catch(false),
  labelRead: z.preprocess((v) => (typeof v === 'string' ? ['true', 'yes', '1'].includes(v.trim().toLowerCase()) : v === true), z.boolean()).catch(false),
  barcode: z.string().trim().regex(/^\d{8,14}$/).optional().catch(undefined),
  portion: z.string().trim().min(1).max(60).catch('1 serving'),
  portionGrams: z.coerce.number().finite().min(1).max(3000),
  kcalPer100: z.coerce.number().finite().min(0).max(950),
  proteinPer100: per100, carbsPer100: per100, fatPer100: per100,
}).strip();
type ModelEstimate = z.infer<typeof ModelEstimate>;

/** Exact per-100 g values from Open Food Facts when the photo shows a readable barcode. */
async function lookupBarcode(code: string): Promise<{ name: string; kcal: number; p: number; c: number; f: number; packGrams: number | null } | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`, { headers: { 'User-Agent': 'WarfareFitness/1.0' }, signal: AbortSignal.timeout(6_000) });
    const d = await res.json() as { status?: number; product?: { product_name?: string; product_quantity?: number | string; nutriments?: Record<string, number> } };
    const n = d.product?.nutriments;
    if (d.status !== 1 || !n || !(n['energy-kcal_100g'] > 0)) return null;
    const q = Number(d.product?.product_quantity);
    return { name: d.product?.product_name || '', kcal: n['energy-kcal_100g'], p: n.proteins_100g || 0, c: n.carbohydrates_100g || 0, f: n.fat_100g || 0, packGrams: q > 0 && q < 5000 ? q : null };
  } catch { return null; }
}

function totals(m: ModelEstimate, label: { name: string; kcal: number; p: number; c: number; f: number; packGrams: number | null } | null) {
  const grams = label?.packGrams && m.packaged ? label.packGrams : m.portionGrams;
  let kcal100 = label?.kcal ?? m.kcalPer100;
  const p100 = label?.p ?? m.proteinPer100, c100 = label?.c ?? m.carbsPer100, f100 = label?.f ?? m.fatPer100;
  // Energy check: calories must roughly agree with the macros (4/4/9). When
  // nothing was read off a label and they disagree by over 20%, the macros
  // win, since a single wrong calorie figure is the likelier mistake.
  const fromMacros = 4 * p100 + 4 * c100 + 9 * f100;
  if (!label && !m.labelRead && fromMacros > 0 && Math.abs(kcal100 - fromMacros) / fromMacros > 0.2) kcal100 = fromMacros;
  const k = grams / 100;
  return {
    name: (label?.name || m.name).slice(0, 120),
    calories: Math.round(kcal100 * k),
    protein: Math.round(p100 * k * 10) / 10,
    carbs: Math.round(c100 * k * 10) / 10,
    fat: Math.round(f100 * k * 10) / 10,
    portion: (label?.packGrams && m.packaged ? `${Math.round(grams)} g pack` : m.portion).slice(0, 60),
    packaged: m.packaged,
    source: label ? 'barcode' : m.labelRead ? 'label' : 'estimate',
  };
}

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

    // The stronger vision model: label text and pack sizes need it.
    const model = process.env.OPENAI_VISION_MODEL ?? 'gpt-4.1';
    const openai = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 600,
      // Deterministic. At the default temperature the same photo of the same
      // bottle came back three times with three different portion guesses
      // (100 ml, ~350 ml, 500 ml). The nutrition per 100 ml was consistent
      // every time; only the assumed amount wandered. With temperature 0 and a
      // seed the same photo gives the same answer.
      temperature: 0,
      seed: 7,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a nutrition analyst. Identify the food in the photo and return ONLY valid JSON:
{
  "name": "food name (brand + product if packaged)",
  "packaged": true or false,
  "labelRead": true if you read the nutrition values off a visible label, else false,
  "barcode": "digits of the barcode if clearly readable, else omit",
  "portion": "what the portion is, e.g. '1 bag (40 g)', '1 plate (~350 g)', '500 ml bottle'",
  "portionGrams": weight of the whole portion in grams (ml for drinks),
  "kcalPer100": kcal per 100 g, "proteinPer100": g, "carbsPer100": g, "fatPer100": g
}
Method:
1. Per-100 g values: if a nutrition label is readable, copy its per-100 g column exactly (labelRead: true). Otherwise use standard food-composition values for that food (e.g. potato crisps ~530 kcal, cooked white rice ~130, grilled chicken breast ~165, cola ~42 per 100 ml).
2. Portion weight: if the pack shows a net weight (e.g. "40g", "150 g", "330 ml"), use it. Otherwise judge from size cues (hands, plate, cutlery, can). Typical sizes: single-serve crisp bag 25-45 g, sharing bag 120-200 g, chocolate bar 40-50 g, can 330 ml, dinner plate of food 300-500 g.
3. Never invent extra food that is not visible. Be consistent: the same photo must give the same answer.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' },
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
    const raw = ModelEstimate.safeParse(JSON.parse(jsonMatch[0]));
    if (!raw.success) {
      throw new Error('AI returned an unusable estimate — please try another photo');
    }
    const label = raw.data.barcode ? await lookupBarcode(raw.data.barcode) : null;
    const parsed = NutritionEstimate.safeParse(totals(raw.data, label));
    if (!parsed.success) {
      throw new Error('AI returned an unusable estimate — please try another photo');
    }
    const t = totals(raw.data, label);
    return NextResponse.json({ ...parsed.data, source: t.source, portionGrams: Math.round(label?.packGrams && raw.data.packaged ? label.packGrams : raw.data.portionGrams), remaining: usage.remaining });
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
