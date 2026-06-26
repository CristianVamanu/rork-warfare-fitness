import { NextRequest, NextResponse } from 'next/server';

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
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
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });

  try {
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

    return NextResponse.json({
      name: product.product_name || 'Unknown Product',
      brand: product.brands || '',
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
