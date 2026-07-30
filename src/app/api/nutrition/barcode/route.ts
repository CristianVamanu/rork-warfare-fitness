export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, resolveConfiguredDailyLimit } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';

const DEFAULT_DAILY_SCAN_LIMIT = 20;

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    nutriscore_grade?: string;   // 'a' | 'b' | 'c' | 'd' | 'e'
    nova_group?: number;         // 1-4, processing level (1 = unprocessed, 4 = ultra-processed)
    ecoscore_grade?: string;     // 'a' | 'b' | 'c' | 'd' | 'e' — environmental impact
    additives_tags?: string[];
    labels_tags?: string[];      // e.g. 'en:organic', 'en:vegan'
    ingredients_text?: string;
    nutrient_levels?: {
      fat?: 'low' | 'moderate' | 'high';
      'saturated-fat'?: 'low' | 'moderate' | 'high';
      sugars?: 'low' | 'moderate' | 'high';
      salt?: 'low' | 'moderate' | 'high';
    };
    nutriments?: {
      'energy-kcal_100g'?: number;
      'energy-kcal'?: number;
      'proteins_100g'?: number;
      'carbohydrates_100g'?: number;
      'fat_100g'?: number;
      'fiber_100g'?: number;
      'sugars_100g'?: number;
      'salt_100g'?: number;
    };
  };
}

const KNOWN_LABELS: Record<string, string> = {
  'en:organic': 'Organic',
  'en:vegan': 'Vegan',
  'en:vegetarian': 'Vegetarian',
  'en:gluten-free': 'Gluten-Free',
  'en:no-preservatives': 'No Preservatives',
  'en:no-additives': 'No Additives',
  'en:fair-trade': 'Fair Trade',
  'en:palm-oil-free': 'Palm Oil Free',
};

export async function GET(req: NextRequest) {
  // Verifies the caller's own login token instead of trusting a
  // client-supplied uid — see analyze-food/route.ts for why this matters.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const uid = authCheck.uid;

  try {
    const code = req.nextUrl.searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    const dailyLimit = await resolveConfiguredDailyLimit(app, 'barcodeScanDailyLimit', DEFAULT_DAILY_SCAN_LIMIT);
    const usage = await checkAndIncrementUsage(app, uid, 'barcode', dailyLimit);
    if (!usage.allowed) {
      return NextResponse.json(
        { error: `Daily scan limit reached (${dailyLimit}/day). Try again tomorrow.`, remaining: 0 },
        { status: 429 }
      );
    }

    // Product barcodes are numeric only (EAN-8/13, UPC-A/E). Reject anything
    // else before it reaches the external request — a malformed/non-numeric
    // "code" (e.g. from a stray QR scan) breaks the OpenFoodFacts URL and
    // surfaces as a confusing low-level fetch/URL error to the user.
    if (!/^\d{6,14}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid barcode format' }, { status: 400 });
    }

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${code}.json`,
      {
        headers: { 'User-Agent': 'WarfareFitness/1.0' },
        next: { revalidate: 3600 },
      }
    );

    const data: OpenFoodFactsResponse = await res.json();

    if (data.status !== 1 || !data.product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { product } = data;
    const n = product.nutriments || {};

    const grade = product.nutriscore_grade?.toLowerCase();
    const validGrade = grade && ['a', 'b', 'c', 'd', 'e'].includes(grade) ? grade : null;
    const ecoGrade = product.ecoscore_grade?.toLowerCase();
    const validEcoGrade = ecoGrade && ['a', 'b', 'c', 'd', 'e'].includes(ecoGrade) ? ecoGrade : null;

    const labels = (product.labels_tags ?? [])
      .map((tag) => KNOWN_LABELS[tag])
      .filter((label): label is string => !!label);

    return NextResponse.json({
      remaining: usage.remaining,
      name: product.product_name || 'Unknown Product',
      brand: product.brands || '',
      nutriScoreGrade: validGrade,
      novaGroup: product.nova_group ?? null,
      ecoScoreGrade: validEcoGrade,
      additivesCount: product.additives_tags?.length ?? 0,
      additives: (product.additives_tags ?? []).map((t) => t.replace(/^en:/, '').toUpperCase()),
      nutrientLevels: product.nutrient_levels ?? null,
      labels,
      nutrition: {
        name: product.product_name || 'Unknown Product',
        calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
        protein: Math.round((n['proteins_100g'] || 0) * 10) / 10,
        carbs: Math.round((n['carbohydrates_100g'] || 0) * 10) / 10,
        fat: Math.round((n['fat_100g'] || 0) * 10) / 10,
        fiber: Math.round((n['fiber_100g'] || 0) * 10) / 10,
        sugar: Math.round((n['sugars_100g'] || 0) * 10) / 10,
        salt: Math.round((n['salt_100g'] || 0) * 10) / 10,
      },
    });
  } catch (err) {
    console.error('Barcode lookup error:', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
