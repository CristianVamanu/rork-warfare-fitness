export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

export async function POST(req: NextRequest) {
  try {
    const { userId, userEmail } = await req.json() as { userId: string; userEmail: string };
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    // Read membership config from Firestore
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const cfgSnap = await db.collection('config').doc('membership').get();
    if (!cfgSnap.exists) return NextResponse.json({ error: 'Membership not configured' }, { status: 400 });

    const cfg = cfgSnap.data()!;
    if (!cfg.enabled) return NextResponse.json({ error: 'Membership not enabled' }, { status: 400 });

    const feeUsd = Number(cfg.fee ?? 0);
    if (feeUsd <= 0) return NextResponse.json({ error: 'Membership fee not set' }, { status: 400 });

    const stripe = await getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    // Active time-limited discount, if the admin has set one
    let discounts: { coupon: string }[] | undefined;
    const discountPercent = Number(cfg.discountPercent ?? 0);
    const discountExpiresAt = cfg.discountExpiresAt ? new Date(cfg.discountExpiresAt as string) : null;
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
            currency: cfg.currency ?? 'usd',
            unit_amount: Math.round(feeUsd * 100), // cents
            recurring: { interval: 'month' },
            product_data: { name: 'Warfare Fitness Membership' },
          },
        },
      ],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      subscription_data: {
        // Pass userId so the webhook knows which user to activate. No
        // trial_period_days here — the app already grants trialDays of
        // free access from account creation (MembershipGuard), independent
        // of Stripe. Adding a second trial here meant anyone who checked
        // out after their app-level trial started got a second full trial
        // stacked on top, doubling the free period.
        metadata: { userId },
      },
      metadata: { userId },
      success_url: `${appUrl}/profile?subscribed=1`,
      cancel_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session';
    console.error('[Stripe] member-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
