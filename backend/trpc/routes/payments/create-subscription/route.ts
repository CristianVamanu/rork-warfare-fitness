import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

const tierPriceSchema = z.enum(['premium']);

export default publicProcedure
  .input(z.object({
    tier: tierPriceSchema,
    stripeSecretKey: z.string(),
    price: z.number(),
  }))
  .mutation(async ({ input }) => {
    const { tier, stripeSecretKey, price } = input;

    console.log('[Stripe] Creating checkout session for tier:', tier);

    try {
      const amountInCents = Math.round(price * 100);
      const params = new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'Premium Subscription',
        'line_items[0][price_data][product_data][description]': `7-day free trial, then ${price}/month`,
        'line_items[0][price_data][unit_amount]': String(amountInCents),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': '1',
        'success_url': 'https://warfarefitness.com/success',
        'cancel_url': 'https://warfarefitness.com/cancel',
        'subscription_data[trial_period_days]': '7',
      });

      console.log('[Stripe] Request params:', params.toString());

      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const responseText = await response.text();
      console.log('[Stripe] Response status:', response.status);
      console.log('[Stripe] Response:', responseText);

      if (!response.ok) {
        console.error('[Stripe] Error creating session:', responseText);
        throw new Error(`Stripe API error: ${response.status} - ${responseText}`);
      }

      const session = JSON.parse(responseText);
      console.log('[Stripe] Session created:', session.id);

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      console.error('[Stripe] Failed to create checkout session:', error);
      throw new Error('Failed to create payment session');
    }
  });
