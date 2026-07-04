export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkAndIncrementDailyLimit } from '@/lib/rateLimit';

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    nutriscore_grade?: string;   // 'a' | 'b' | 'c' | 'd' | 'e'
    nova_group?: number;         // 1-4, processing level (1 = unprocessed, 4 = ultra-processed)
    additives_tags?: string[];
    nutriments?: {
      'energy-kcal_100g'?: number;
      'energy-kcal'?: number;
      'proteins_100g'?: number;
      'carbohydrates_100g'?: number;
      'fat_100g'?: number;
      'fiber_100g'?: number;
      'sugars_100g'?: number;
    };
  };
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });

    // Product barcodes are numeric only (EAN-8/13, UPC-A/E). Reject anything
    // else before it reaches the external request — a malformed/non-numeric
    // "code" (e.g. from a stray QR scan) breaks the OpenFoodFacts URL and
    // surfaces as a confusing low-level fetch/URL error to the user.
    if (!/^\d{6,14}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid barcode format' }, { status: 400 });
    }

    const check = await verifyUser(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const limit = await checkAndIncrementDailyLimit(check.uid, 'barcodeScans');
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Daily barcode scan limit reached (${limit.limit}/day). Try again tomorrow.` },
        { status: 429 }
      );
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

    return NextResponse.json({
      name: product.product_name || 'Unknown Product',
      brand: product.brands || '',
      nutriScoreGrade: validGrade,
      novaGroup: product.nova_group ?? null,
      additivesCount: product.additives_tags?.length ?? 0,
      nutrition: {
        name: product.product_name || 'Unknown Product',
        calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
        protein: Math.round((n['proteins_100g'] || 0) * 10) / 10,
        carbs: Math.round((n['carbohydrates_100g'] || 0) * 10) / 10,
        fat: Math.round((n['fat_100g'] || 0) * 10) / 10,
        fiber: Math.round((n['fiber_100g'] || 0) * 10) / 10,
        sugar: Math.round((n['sugars_100g'] || 0) * 10) / 10,
      },
    });
  } catch (err) {
    console.error('Barcode lookup error:', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
