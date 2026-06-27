import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { trainerId, email, priceId, successUrl, cancelUrl } = await req.json();

    if (!trainerId || !priceId) {
      return NextResponse.json({ error: 'trainerId and priceId are required' }, { status: 400 });
    }

    const stripe = getStripe();
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
