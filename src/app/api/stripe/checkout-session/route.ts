export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What became of an embedded Checkout Session — read by /checkout/complete
 * when Stripe returns the buyer to us.
 *
 * It also grants. Membership used to come only from the webhook, and the
 * member returned from paying to a "setting up your access" card until it
 * arrived — seconds usually, sometimes much longer, once reported as never.
 * Stripe is asked directly here whether the session completed and the
 * money is in, and if so the same guarded writer the webhook uses records
 * the membership before this responds. Nothing here trusts the client:
 * the session must belong to the caller and Stripe must say it is paid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { grantFromCheckoutSession } from '@/lib/stripeMembership';

export async function GET(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  const sessionId = req.nextUrl.searchParams.get('session_id') ?? '';
  // Checkout Session ids are cs_… — anything else never reaches Stripe.
  if (!/^cs_[A-Za-z0-9_]{8,}$/.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
  }

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // A session belongs to the account that started it. Someone else's id —
    // guessed, leaked, or shared — reveals nothing, not even that it exists.
    if (session.metadata?.userId !== authCheck.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    let granted = false;
    if (session.status === 'complete') {
      const app = getAdminApp();
      if (app) {
        try {
          granted = await grantFromCheckoutSession(getAdminDb(app), stripe, session, 'checkout return');
        } catch (err) {
          // The webhook still grants; this only lost the head start.
          console.error('[checkout-session] grant on return failed:', err instanceof Error ? err.message : err);
        }
      }
    }
    return NextResponse.json({
      status: session.status,               // 'open' | 'complete' | 'expired'
      paymentStatus: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      kind: session.metadata?.kind ?? null,
      granted,
    });
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number })?.statusCode;
    if (code === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error('[checkout-session] lookup failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not confirm the payment right now.' }, { status: 500 });
  }
}
