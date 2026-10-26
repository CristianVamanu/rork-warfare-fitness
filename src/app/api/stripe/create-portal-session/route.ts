export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a real Stripe Billing Portal session for the caller's subscription
 * so they can update their card, view invoices, or cancel — replaces what
 * used to be a hardcoded placeholder link (billing.stripe.com/p/login/test_...)
 * that 404'd for every user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { resolveAccountEmail } from '@/lib/accountEmail';
import { getStripe } from '@/lib/stripe';
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer';

export async function POST(req: NextRequest) {
  try {
    // Rejects a session still pending its 2FA code, like every other route
    // that can change billing. A stolen password alone must not be enough
    // to cancel a plan or open the billing portal.
    const check = await verifyAuthedNotTfaPending(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
    const uid = check.uid;

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const db = getAdminDb(app);
    const userSnap = await db.collection('users').doc(uid).get();
    const stripe = await getStripe();

    // Resolved from the account, not from a live subscription. Looking the
    // customer up THROUGH a subscription meant anyone without one — cancelled
    // last week, trial lapsed, payment failed — had no route to their own
    // invoices or card details at all, which is precisely when someone most
    // needs the portal. getOrCreateStripeCustomer also adopts the customer
    // behind any existing subscription, so this keeps working for accounts
    // that predate the mapping.
    let customerId: string;
    try {
      customerId = await getOrCreateStripeCustomer({
        db, stripe, uid,
        email: await resolveAccountEmail(uid, userSnap.data()?.email as string | undefined),
        name: userSnap.data()?.displayName as string | undefined,
      });
    } catch (err) {
      console.error('[Stripe] portal: could not resolve customer:', err);
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[create-portal-session] Stripe error:', err instanceof Error ? err.message : err);
    const msg = 'Could not open billing right now. Try again in a moment.';
    console.error('[create-portal-session] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
