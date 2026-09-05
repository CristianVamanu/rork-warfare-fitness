export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import type { CoachingPlan } from '@/types';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

export async function POST(req: NextRequest) {
  // Verifies the caller's own login token — see plan-checkout/route.ts.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const userId = authCheck.uid;

  try {
    const { userEmail, planId } = await req.json() as { userEmail: string; planId: string };
    if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const snap = await db.collection('config').doc('coachingPlans').get();
    const plans = (snap.data()?.plans as CoachingPlan[]) ?? [];
    const plan = plans.find((p) => p.id === planId && p.active);
    if (!plan) return NextResponse.json({ error: 'Coaching plan not found or inactive' }, { status: 404 });
    if (plan.priceMonthly <= 0) return NextResponse.json({ error: 'Plan price not set' }, { status: 400 });

    // Same guard plan-checkout/program-checkout already have — without it a
    // double-click or a retry on a slow connection could create two separate
    // coaching subscriptions for the same user.
    const userSnap = await db.collection('users').doc(userId).get();
    if (userSnap.data()?.coaching?.status === 'active') {
      return NextResponse.json({ error: 'You already have an active coaching subscription.' }, { status: 400 });
    }

    // Coaching is sold only after a 1:1 application has been reviewed and
    // approved — that is what the whole application flow is for. The route
    // never checked it, so any signed-in account could buy coaching by
    // calling this directly; the rule lived only in where the button was
    // placed. Two equality filters, so no composite index is needed.
    const approved = await db.collection('coachingApplications')
      .where('userId', '==', userId)
      .where('status', '==', 'approved')
      .limit(1)
      .get();
    if (approved.empty) {
      return NextResponse.json(
        { error: 'Coaching checkout opens once your 1:1 application has been approved.' },
        { status: 403 },
      );
    }

    const stripe = await getStripe();
    // One durable Customer per account, instead of customer_email making
    // Stripe mint a fresh one on every checkout — which split a single
    // member's cards and invoices across several customers and left
    // anyone without a live subscription unable to reach their billing.
    const customerId = await getOrCreateStripeCustomer({
      db, stripe, uid: userId, email: userEmail,
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    // Reuse the same site-wide time-limited discount as platform membership, if active
    let discounts: { coupon: string }[] | undefined;
    const membershipCfgSnap = await db.collection('config').doc('membership').get();
    const membershipCfg = membershipCfgSnap.data() ?? {};
    const discountPercent = Number(membershipCfg.discountPercent ?? 0);
    const discountExpiresAt = membershipCfg.discountExpiresAt ? new Date(membershipCfg.discountExpiresAt as string) : null;
    if (discountPercent > 0 && discountExpiresAt && discountExpiresAt.getTime() > Date.now()) {
      const coupon = await stripe.coupons.create({ percent_off: discountPercent, duration: 'once' });
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (plan.currency ?? 'USD').toLowerCase(),
            unit_amount: Math.round(plan.priceMonthly * 100),
            recurring: { interval: 'month' },
            product_data: { name: plan.name },
          },
        },
      ],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      subscription_data: {
        metadata: { userId, planId, planName: plan.name, kind: 'coaching' },
      },
      metadata: { userId, planId, planName: plan.name, kind: 'coaching' },
      success_url: `${appUrl}/profile?subscribed=coaching`,
      cancel_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create coaching checkout session';
    console.error('[Stripe] coaching-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
