export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Undoes a period-end cancellation. Cancelling only sets
 * cancel_at_period_end on the Stripe subscription (see cancel-subscription),
 * so until the period actually runs out the subscription is still live and
 * Stripe lets it be resumed with a single flag flip — no new checkout, no
 * new trial, same price, same renewal date. Before this route existed the
 * profile card showed "Cancelled — access continues until …" with no way
 * back, so a member who changed their mind had to wait for the lapse and
 * buy again.
 *
 * Once the period HAS ended the subscription is canceled for real and this
 * route refuses; the card is then in its "Subscribe" state anyway.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthedNotTfaPending(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
    const uid = check.uid;

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const { kind } = await req.json().catch(() => ({ kind: undefined })) as { kind?: 'membership' | 'coaching' };
    const field = kind === 'coaching' ? 'coaching' : 'membership';

    const db = getAdminDb(app);
    const userSnap = await db.collection('users').doc(uid).get();
    const subId = userSnap.data()?.[field]?.stripeSubscriptionId as string | undefined;
    if (!subId) return NextResponse.json({ error: `No ${field} subscription found` }, { status: 400 });

    const stripe = await getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub.status === 'canceled') {
      return NextResponse.json({ error: 'That subscription has already ended. Start a new one from the plan card.', code: 'ENDED' }, { status: 409 });
    }
    if (!sub.cancel_at_period_end) {
      // Nothing to undo — the webhook may simply not have caught up yet.
      await db.collection('users').doc(uid).update({ [`${field}.cancelAtPeriodEnd`]: false, [`${field}.updatedAt`]: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });

    await db.collection('users').doc(uid).update({
      [`${field}.cancelAtPeriodEnd`]: false,
      [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[resume-subscription] Stripe error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not resume your subscription right now. Try again, or contact support.' }, { status: 500 });
  }
}
