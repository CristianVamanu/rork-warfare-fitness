export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What became of an embedded Checkout Session — read by /checkout/complete
 * when Stripe returns the buyer to us.
 *
 * Read-only and deliberately thin: membership is granted by the webhook,
 * never here, so this route cannot be used to unlock anything. It only
 * answers "did that session finish?" so the page can either send the
 * member into the app or tell them the payment did not go through.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { verifyAuthed } from '@/lib/verifyAdmin';

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
    return NextResponse.json({
      status: session.status,               // 'open' | 'complete' | 'expired'
      paymentStatus: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      kind: session.metadata?.kind ?? null,
    });
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number })?.statusCode;
    if (code === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error('[checkout-session] lookup failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not confirm the payment right now.' }, { status: 500 });
  }
}
