export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin control over a member's membership: grant, keep, cancel at period
 * end, or cancel now.
 *
 * Replaces a client-side-only Firestore write that only ever flipped
 * `membership.status` — for a user with a real Stripe subscription that
 * left the subscription itself untouched: Stripe kept billing their card
 * every cycle while the app showed them as not a member, and the next
 * subscription webhook silently flipped the status back to 'active'.
 * Every action here changes Stripe first, so what the admin clicked is
 * what actually happens to the member.
 *
 * The decision of what to do lives in lib/adminMembership and is tested;
 * this route only carries it out and records it. Each action writes one
 * row to `adminActions` so "who cancelled this member, and when" has an
 * answer that is not "check Stripe and guess".
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { planMembershipAction, isAdminMembershipAction, type MembershipState } from '@/lib/adminMembership';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId, status } = await req.json().catch(() => ({})) as { userId?: string; status?: unknown };
  if (!userId || !isAdminMembershipAction(status)) {
    return NextResponse.json(
      { error: 'userId and status ("active" | "none" | "cancel_at_period_end") are required' },
      { status: 400 },
    );
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const db = getAdminDb(app);
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const current = (userSnap.data()?.membership ?? {}) as MembershipState;

    const decision = planMembershipAction(current, status);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
    const { plan } = decision;

    // Stripe first. If this throws for a reason other than "already
    // cancelled", the member's record must not change — a Firestore status
    // that disagrees with Stripe is the exact bug this route exists to end.
    if (plan.stripe && current.stripeSubscriptionId) {
      const stripe = await getStripe();
      const subId = current.stripeSubscriptionId;
      try {
        if (plan.stripe === 'cancel_now') await stripe.subscriptions.cancel(subId);
        else if (plan.stripe === 'cancel_at_period_end') await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
        else if (plan.stripe === 'resume') await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
      } catch (err) {
        // A subscription already cancelled on Stripe's side throws on
        // cancel_now. The Firestore status still has to move, so that one
        // case is logged and tolerated. Anything else is a real failure.
        const msg = err instanceof Error ? err.message : String(err);
        const alreadyGone = plan.stripe === 'cancel_now' && /canceled|cancelled|No such subscription/i.test(msg);
        console.error('[admin/set-membership] Stripe error:', msg);
        if (!alreadyGone) {
          return NextResponse.json({ error: 'Stripe refused the change; nothing was altered. Try again or check the subscription in Stripe.' }, { status: 502 });
        }
      }
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(plan.set)) {
      update[`membership.${k}`] = v === 'serverTimestamp' ? FieldValue.serverTimestamp() : v;
    }
    for (const k of plan.clear) update[`membership.${k}`] = FieldValue.delete();
    await userRef.update(update);

    await db.collection('adminActions').add({
      at: FieldValue.serverTimestamp(),
      by: check.uid,
      userId,
      action: `membership.${plan.audit}`,
      stripeSubscriptionId: current.stripeSubscriptionId ?? null,
    });

    return NextResponse.json({ ok: true, action: plan.audit });
  } catch (err) {
    console.error('[admin/set-membership] Error:', err);
    return NextResponse.json({ error: 'Failed to update membership' }, { status: 500 });
  }
}
