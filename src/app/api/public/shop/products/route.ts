export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — the storefront's products, or one by ?slug=. Public: the shop is
 * open to anyone, and what is gated is the *buying*, which /api/shop/checkout
 * enforces. Locked items are listed with earnedOnly so the page can show
 * the lock; that is the marketing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getShopConfig, publicProduct } from '@/lib/shop/server';
import type { ShopProduct } from '@/types';

const CACHE = 'public, max-age=30, s-maxage=120, stale-while-revalidate=600';

export async function GET(req: NextRequest) {
  const app = getAdminApp();
  if (!app) return NextResponse.json({ products: [], enabled: false }, { status: 500 });
  const db = getAdminDb(app);
  try {
    const cfg = await getShopConfig(db);
    const slug = req.nextUrl.searchParams.get('slug');
    if (slug) {
      const snap = await db.collection('products').where('slug', '==', slug).where('active', '==', true).limit(1).get();
      const d = snap.docs[0];
      if (!d) return NextResponse.json({ product: null }, { status: 404, headers: { 'Cache-Control': CACHE } });
      return NextResponse.json({ product: publicProduct(d.id, d.data() as ShopProduct), enabled: cfg.enabled !== false, tagline: cfg.tagline ?? null }, { headers: { 'Cache-Control': CACHE } });
    }
    const snap = await db.collection('products').where('active', '==', true).get();
    const products = snap.docs.map((d) => ({ ...publicProduct(d.id, d.data() as ShopProduct), sortOrder: (d.data() as ShopProduct).sortOrder ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return NextResponse.json({ products, enabled: cfg.enabled !== false, tagline: cfg.tagline ?? null, shippingCents: cfg.shippingCents ?? 0 }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/shop/products]', err instanceof Error ? err.message : err);
    return NextResponse.json({ products: [], enabled: false }, { status: 500 });
  }
}
