export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin grant/revoke membership toggle. Replaces a client-side-only
 * Firestore write (setUserMembership) that only ever flipped
 * `membership.status` — for a user with a real Stripe subscription,
 * revoking that way left the subscription itself untouched: Stripe kept
 * billing their card every cycle while the app showed them as not a
 * member, and the next subscription webhook (renewal, update) would
 * silently flip `membership.status` back to 'active' regardless of what
 * the admin just did. Cancelling the underlying subscription here first
 * makes the admin's action match what actually happens to the user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId, status } = await req.json() as { userId?: string; status?: 'active' | 'none' };
  if (!userId || (status !== 'active' && status !== 'none')) {
    return NextResponse.json({ error: 'userId and status ("active" | "none") are required' }, { status: 400 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const db = getAdminDb(app);
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const subId = userSnap.data()?.membership?.stripeSubscriptionId as string | undefined;

    if (status === 'none' && subId) {
      try {
        const stripe = await getStripe();
        await stripe.subscriptions.cancel(subId);
      } catch (err) {
        // A subscription already canceled on Stripe's side (e.g. a prior
        // manual cancellation) throws here — the Firestore status still
        // needs to move to 'none', so this isn't fatal to the request.
        console.error('[admin/set-membership] Stripe cancel failed:', err);
      }
    }

    await userRef.update({
      'membership.status': status,
      'membership.grantedAt': FieldValue.serverTimestamp(),
      ...(status === 'none' ? { 'membership.stripeSubscriptionId': FieldValue.delete(), 'membership.cancelAtPeriodEnd': FieldValue.delete() } : {}),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/set-membership] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update membership';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
