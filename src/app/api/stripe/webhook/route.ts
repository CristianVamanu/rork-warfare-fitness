import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type Stripe from 'stripe';

// Stripe requires the raw body for signature verification
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') ?? '';
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed';
    console.error('[Stripe webhook]', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const trainerId = sub.metadata?.trainerId;

      if (!trainerId) {
        console.warn('[Stripe webhook] Subscription missing trainerId metadata — skipping');
        break;
      }

      const rawStatus = sub.status;
      const subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' =
        rawStatus === 'active' ? 'active' :
        rawStatus === 'trialing' ? 'trialing' :
        rawStatus === 'past_due' ? 'past_due' :
        rawStatus === 'canceled' ? 'canceled' : 'inactive';

      await updateDoc(doc(db, 'tenants', trainerId), {
        'stripe.subscriptionId': sub.id,
        'stripe.customerId': sub.customer as string,
        'stripe.subscriptionStatus': subscriptionStatus,
        'stripe.currentPeriodEnd': new Date(sub.current_period_end * 1000),
      });

      console.log(`[Stripe webhook] Tenant ${trainerId} → ${subscriptionStatus}`);
      break;
    }

    case 'checkout.session.completed': {
      // Handled via subscription events above — no extra action needed
      break;
    }

    default:
      // Unhandled event type — safe to ignore
  }

  return NextResponse.json({ received: true });
}
