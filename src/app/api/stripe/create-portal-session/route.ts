export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a real Stripe Billing Portal session for the caller's subscription
 * so they can update their card, view invoices, or cancel — replaces what
 * used to be a hardcoded placeholder link (billing.stripe.com/p/login/test_...)
 * that 404'd for every user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
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
    // Falls back to the coaching subscription if there's no membership one
    // — either is enough to look up the shared Stripe Customer, and
    // Stripe's own portal lists every subscription on that customer, not
    // just the one used to find them (so a coaching-only user still sees
    // and can manage their subscription here, not just a membership one).
    const subId = (userSnap.data()?.membership?.stripeSubscriptionId ?? userSnap.data()?.coaching?.stripeSubscriptionId) as string | undefined;
    if (!subId) return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });

    const stripe = await getStripe();
    const subscription = await stripe.subscriptions.retrieve(subId);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create billing portal session';
    console.error('[create-portal-session] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
