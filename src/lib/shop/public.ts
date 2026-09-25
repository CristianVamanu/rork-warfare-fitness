import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getShopConfig, publicProduct, type PublicProduct } from './server';
import type { ShopProduct } from '@/types';

/**
 * What the storefront pages read, straight from Firestore with the Admin
 * SDK. The pages used to fetch /api/public/shop/... over HTTP from inside
 * their own render — a round trip out through the public domain and back
 * to the same box, which is exactly the hop the notification runner's
 * comment warns about (DNS, Cloudflare's timeouts). The route still exists
 * for anything outside the app; the pages no longer depend on it.
 */

export interface ShopListing {
  products: PublicProduct[];
  enabled: boolean;
  tagline: string | null;
}

export async function loadShopListing(): Promise<ShopListing> {
  const app = getAdminApp();
  if (!app) return { products: [], enabled: false, tagline: null };
  try {
    const db = getAdminDb(app);
    const [cfg, snap] = await Promise.all([getShopConfig(db), db.collection('products').where('active', '==', true).get()]);
    const products = snap.docs
      .map((d) => ({ ...publicProduct(d.id, d.data() as ShopProduct), sortOrder: (d.data() as ShopProduct).sortOrder ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ sortOrder: _s, ...p }) => p);
    return { products, enabled: cfg.enabled !== false, tagline: cfg.tagline ?? null };
  } catch (err) {
    console.error('[shop] listing failed:', err instanceof Error ? err.message : err);
    return { products: [], enabled: false, tagline: null };
  }
}

export async function loadShopProduct(slug: string): Promise<PublicProduct | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await getAdminDb(app).collection('products').where('slug', '==', slug).where('active', '==', true).limit(1).get();
    const d = snap.docs[0];
    return d ? publicProduct(d.id, d.data() as ShopProduct) : null;
  } catch (err) {
    console.error('[shop] product failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
