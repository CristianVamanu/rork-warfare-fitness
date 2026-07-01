export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase-admin';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app);
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
    const trialDays = Number(cfg.trialDays ?? 0);

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
      subscription_data: {
        // Pass userId so the webhook knows which user to activate
        metadata: { userId },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
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
