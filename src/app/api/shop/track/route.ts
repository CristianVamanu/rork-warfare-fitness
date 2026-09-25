export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST {orderNumber, email} — find an order by the short number on the
 * confirmation (the first 8 characters of its id, upper-case) plus the
 * email it was placed with. No account needed: this is the "track my
 * parcel" box for a guest who lost the email link, and for a member on a
 * device they are not signed in on.
 *
 * Both halves must match. The order number alone is guessable in theory
 * (8 characters of a random id), the email alone is not a secret; together
 * they identify the buyer. Rate-limited per IP so nobody can brute either.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { publicOrder } from '@/lib/shop/server';
import type { ShopOrder } from '@/types';

export async function POST(req: NextRequest) {
  const limit = await rateLimit({ scope: 'shop-track', key: clientIp(req), windowMs: 15 * 60_000, max: 20 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts — try again in a few minutes' }, { status: 429 });

  const body = await req.json().catch(() => null) as { orderNumber?: string; email?: string } | null;
  const num = (body?.orderNumber ?? '').trim().replace(/^#/, '').toLowerCase();
  const email = (body?.email ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(num) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter the order number from your confirmation and the email you used' }, { status: 400 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const db = getAdminDb(app);

  // Firestore ids are case-sensitive and the order number is shown upper-
  // case; a prefix range query on the document id finds it either way by
  // trying the raw form. The id's first 8 chars are what people type.
  const candidates = await db.collection('orders').where('email', '==', email).limit(50).get();
  const hit = candidates.docs.find((d) => d.id.slice(0, num.length).toLowerCase() === num);
  if (!hit) return NextResponse.json({ error: 'No order found for that number and email' }, { status: 404 });

  const o = { id: hit.id, ...hit.data() } as ShopOrder;
  return NextResponse.json({ order: publicOrder(o), token: o.accessToken });
}
