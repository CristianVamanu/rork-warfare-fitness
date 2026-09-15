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

    // membership and coaching are tracked separately — a user can hold
    // both at once, so which one to cancel has to be explicit rather than
    // always assuming "membership" (that used to be the only option, and
    // silently cancelled/tracked whichever subscription happened to be in
    // the shared field, not necessarily the one the user meant).
    const { kind } = await req.json().catch(() => ({ kind: undefined })) as { kind?: 'membership' | 'coaching' };
    const field = kind === 'coaching' ? 'coaching' : 'membership';

    const db = getAdminDb(app);
    const userSnap = await db.collection('users').doc(uid).get();
    const subId = userSnap.data()?.[field]?.stripeSubscriptionId as string | undefined;
    if (!subId) return NextResponse.json({ error: `No active ${field} subscription found` }, { status: 400 });

    const stripe = await getStripe();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

    await db.collection('users').doc(uid).update({
      [`${field}.cancelAtPeriodEnd`]: true,
      [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Stripe's message names account/subscription state that is ours, not
    // the member's. Log it; return something generic.
    console.error('[cancel-subscription] Stripe error:', err instanceof Error ? err.message : err);
    const msg = 'Could not cancel your subscription right now. Try again, or contact support.';
    console.error('[cancel-subscription] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
