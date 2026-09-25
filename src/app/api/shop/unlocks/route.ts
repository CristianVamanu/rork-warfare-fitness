export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET (signed in) — which gated products this member has earned, and the
 * challenges they have a verified finish in. The storefront uses it to
 * turn a lock into a Buy button; the real check happens again at checkout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { verifiedChallengeIds, isUnlocked } from '@/lib/shop/server';
import type { ShopProduct } from '@/types';

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const verified = await verifiedChallengeIds(db, check.uid);
  const gated = await db.collection('products').where('earnedOnly', '==', true).get();
  const unlocked = gated.docs.filter((d) => isUnlocked(d.data() as ShopProduct, verified)).map((d) => d.id);
  return NextResponse.json({ unlocked, verified });
}
