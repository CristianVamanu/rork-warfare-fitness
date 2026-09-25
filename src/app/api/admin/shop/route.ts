export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin store operations, one route, `action` in the body:
 *
 *   test          — does the selected provider's key work, which shop/store
 *   import        — pull the provider's products into products/ (upsert by
 *                   providerProductId; keeps our price, gate, slug, active
 *                   flag on products that already exist)
 *   orders        — list orders newest first (pending_payment hidden)
 *   retry         — hand a failed order to the provider again
 *   sync          — poll the provider for every open order now
 *   set-status    — manual override (e.g. cancelled after a refund)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getShopConfig, providerFor, placeProviderOrder, syncOpenOrders, uniqueSlug } from '@/lib/shop/server';
import type { ShopOrder, ShopOrderStatus, ShopProduct } from '@/types';

const STATUSES: ShopOrderStatus[] = ['pending_payment', 'paid', 'submitted', 'in_production', 'shipped', 'delivered', 'cancelled', 'failed'];

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const body = await req.json().catch(() => ({})) as { action?: string; orderId?: string; status?: string };

  try {
    switch (body.action) {
      case 'test': {
        const provider = await providerFor(db);
        return NextResponse.json(await provider.test());
      }
      case 'import': {
        const cfg = await getShopConfig(db);
        const provider = await providerFor(db, cfg);
        const found = await provider.listProducts();
        const existing = await db.collection('products').where('provider', '==', provider.id).get();
        const byPid = new Map(existing.docs.map((d) => [(d.data() as ShopProduct).providerProductId, d]));
        let created = 0, updated = 0;
        for (const p of found) {
          const cur = byPid.get(p.providerProductId);
          if (cur) {
            const c = cur.data() as ShopProduct;
            // Variants are the provider's truth; price and gate are ours.
            const variants = p.variants.map((v) => {
              const mine = (c.variants ?? []).find((x) => x.providerVariantId === v.providerVariantId);
              return { ...v, ...(mine?.priceCents !== undefined ? { priceCents: mine.priceCents } : {}), ...(mine?.printFileUrl ? { printFileUrl: mine.printFileUrl } : {}) };
            });
            await cur.ref.update({ variants, images: c.images?.length ? c.images : p.images, ...(c.description ? {} : { description: p.description ?? '' }), updatedAt: FieldValue.serverTimestamp() });
            updated += 1;
          } else {
            await db.collection('products').add({
              slug: await uniqueSlug(db, p.name), name: p.name, description: p.description ?? '', images: p.images,
              priceCents: p.priceCents, currency: (cfg.currency ?? p.currency ?? 'USD').toUpperCase(),
              provider: provider.id, providerProductId: p.providerProductId, variants: p.variants,
              earnedOnly: false, unlockedBy: [], active: false, sortOrder: 100,
              createdAt: FieldValue.serverTimestamp(),
            });
            created += 1;
          }
        }
        return NextResponse.json({ ok: true, found: found.length, created, updated });
      }
      case 'orders': {
        const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(200).get();
        const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShopOrder).filter((o) => o.status !== 'pending_payment')
          .map((o) => ({ ...o, accessToken: undefined, createdAt: (o.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null, updatedAt: (o.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null, paidAt: (o.paidAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null, shippedAt: (o.shippedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null }));
        return NextResponse.json({ orders });
      }
      case 'retry': {
        if (!body.orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });
        const o = await placeProviderOrder(db, body.orderId);
        return NextResponse.json({ ok: o.status !== 'failed', status: o.status, error: o.error ?? null });
      }
      case 'sync': {
        return NextResponse.json({ ok: true, ...(await syncOpenOrders(db)) });
      }
      case 'set-status': {
        if (!body.orderId || !STATUSES.includes(body.status as ShopOrderStatus)) return NextResponse.json({ error: 'orderId and a valid status required' }, { status: 400 });
        await db.collection('orders').doc(body.orderId).update({ status: body.status, updatedAt: FieldValue.serverTimestamp() });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/shop]', body.action, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
