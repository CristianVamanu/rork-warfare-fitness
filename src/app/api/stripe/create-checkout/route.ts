import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { verifyAdmin } from '@/lib/verifyAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // This is the trainer's own platform-subscription checkout (admin-only) —
  // verify the caller is actually an admin and use their own uid as
  // trainerId, rather than trusting a body-supplied trainerId with no check.
  const authCheck = await verifyAdmin(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const trainerId = authCheck.uid;

  try {
    const { email, priceId, successUrl, cancelUrl } = await req.json();

    if (!priceId) {
      return NextResponse.json({ error: 'priceId is required' }, { status: 400 });
    }

    const stripe = await getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { trainerId }, // stored on subscription for webhook lookup
      },
      success_url: successUrl ?? `${appUrl}/admin?subscribed=1`,
      cancel_url: cancelUrl ?? `${appUrl}/admin`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session';
    console.error('[Stripe] create-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
