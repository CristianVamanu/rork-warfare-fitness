export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lets a user cancel their own membership/coaching subscription.
 * Cancels at period end (they keep access until the current billing
 * period runs out) rather than an immediate hard cancel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    let uid: string;
    try {
      uid = (await getAuth(app).verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const db = getAdminDb(app);
    const userSnap = await db.collection('users').doc(uid).get();
    const subId = userSnap.data()?.membership?.stripeSubscriptionId as string | undefined;
    if (!subId) return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });

    const stripe = await getStripe();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

    await db.collection('users').doc(uid).update({
      'membership.cancelAtPeriodEnd': true,
      'membership.updatedAt': FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel subscription';
    console.error('[cancel-subscription] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
