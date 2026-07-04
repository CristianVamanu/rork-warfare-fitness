export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import type { CoachingPlan } from '@/types';

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

    const snap = await db.collection('config').doc('coachingPlans').get();
    const plans = (snap.data()?.plans as CoachingPlan[]) ?? [];
    const plan = plans.find((p) => p.id === planId && p.active);
    if (!plan) return NextResponse.json({ error: 'Coaching plan not found or inactive' }, { status: 404 });
    if (plan.priceMonthly <= 0) return NextResponse.json({ error: 'Plan price not set' }, { status: 400 });

    const stripe = await getStripe();
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
      subscription_data: {
        metadata: { userId, planId, planName: plan.name },
      },
      metadata: { userId, planId, planName: plan.name },
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
