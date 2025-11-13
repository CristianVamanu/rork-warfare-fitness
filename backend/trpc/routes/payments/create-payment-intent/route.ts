import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export default publicProcedure
  .input(z.object({
    amount: z.number(),
    currency: z.string().default('usd'),
    stripeSecretKey: z.string(),
    customerEmail: z.string().email().optional(),
  }))
  .mutation(async ({ input }) => {
    const { amount, currency, stripeSecretKey, customerEmail } = input;

    console.log('[Stripe] Creating payment intent:', { amount, currency, customerEmail });

    try {
      const amountInCents = Math.round(amount * 100);
      
      const params = new URLSearchParams({
        'amount': String(amountInCents),
        'currency': currency,
        'automatic_payment_methods[enabled]': 'true',
      });

      if (customerEmail) {
        params.append('receipt_email', customerEmail);
      }

      console.log('[Stripe] Request params:', params.toString());

      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const responseText = await response.text();
      console.log('[Stripe] Response status:', response.status);

      if (!response.ok) {
        console.error('[Stripe] Error creating payment intent:', responseText);
        throw new Error(`Stripe API error: ${response.status} - ${responseText}`);
      }

      const paymentIntent = JSON.parse(responseText);
      console.log('[Stripe] Payment intent created:', paymentIntent.id);

      return {
        paymentIntent: paymentIntent.client_secret,
        ephemeralKey: undefined,
        customer: undefined,
      };
    } catch (error) {
      console.error('[Stripe] Failed to create payment intent:', error);
      throw new Error('Failed to create payment intent');
    }
  });
