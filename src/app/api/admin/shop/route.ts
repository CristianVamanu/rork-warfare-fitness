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
import { providerFor, placeProviderOrder, syncOpenOrders, importProducts } from '@/lib/shop/server';
import type { ShopOrder, ShopOrderStatus } from '@/types';

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
        return NextResponse.json({ ok: true, ...(await importProducts(db)) });
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
