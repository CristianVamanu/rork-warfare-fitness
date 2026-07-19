export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Instant self-serve checkout for a membership plan — as opposed to
 * coaching-checkout, which is triggered manually after a 1:1 coaching
 * application is reviewed and approved. Structurally identical to
 * coaching-checkout (subscription mode, same metadata shape, same discount
 * logic) so the existing Stripe webhook handles both without any changes:
 * it already reads planId/planName generically off whichever checkout
 * session or subscription created it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import type { MembershipPlan } from '@/types';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

export async function POST(req: NextRequest) {
  try {
    const { userId, userEmail, planId } = await req.json() as { userId: string; userEmail: string; planId: string };
    if (!userId || !planId) return NextResponse.json({ error: 'userId and planId required' }, { status: 400 });

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const snap = await db.collection('config').doc('membershipPlans').get();
    const plans = (snap.data()?.plans as MembershipPlan[]) ?? [];
    const plan = plans.find((p) => p.id === planId && p.active);
    if (!plan) return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    if (plan.priceMonthly <= 0) return NextResponse.json({ error: 'Plan price not set' }, { status: 400 });

    const stripe = await getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    // Reuse the same site-wide time-limited discount as the rest of checkout
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
      customer_email: userEmail ?? undefined,
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
      // No trial_period_days here — the app-level free trial (Admin ->
      // Membership Settings -> Free Trial Period) already grants full
      // access from account creation, independent of which plan someone
      // eventually checks out with. A second Stripe-side trial would stack
      // on top and double the free period.
      subscription_data: {
        metadata: { userId, planId, planName: plan.name },
      },
      metadata: { userId, planId, planName: plan.name },
      success_url: `${appUrl}/profile?subscribed=1`,
      cancel_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session';
    console.error('[Stripe] plan-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
