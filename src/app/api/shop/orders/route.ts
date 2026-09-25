export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — a member's own orders (Bearer token), or one order by ?id=&t=
 * for a guest holding the access token from their confirmation link. A
 * member may also open one of their own by id without the token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { timingSafeEqualString } from '@/lib/crypto';
import { publicOrder } from '@/lib/shop/server';
import type { ShopOrder } from '@/types';

export async function GET(req: NextRequest) {
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  let uid: string | null = null;
  if (req.headers.get('authorization')) {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
    uid = check.uid;
  }

  const id = req.nextUrl.searchParams.get('id');
  const t = req.nextUrl.searchParams.get('t');
  if (id) {
    const limit = await rateLimit({ scope: 'shop-order-view', key: clientIp(req), windowMs: 60_000, max: 60 });
    if (!limit.allowed) return NextResponse.json({ error: 'Slow down' }, { status: 429 });
    const snap = await db.collection('orders').doc(id).get();
    const o = snap.exists ? ({ id: snap.id, ...snap.data() } as ShopOrder) : null;
    if (!o) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const own = !!uid && o.userId === uid;
    const tokenOk = !!t && !!o.accessToken && timingSafeEqualString(t, o.accessToken);
    if (!own && !tokenOk) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({ order: publicOrder(o) });
  }

  if (!uid) return NextResponse.json({ error: 'Sign in to see your orders' }, { status: 401 });
  const snap = await db.collection('orders').where('userId', '==', uid).get();
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShopOrder)
    .filter((o) => o.status !== 'pending_payment')
    .sort((a, b) => ((b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0) - ((a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0))
    .map(publicOrder);
  return NextResponse.json({ orders });
}
