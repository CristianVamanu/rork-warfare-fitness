import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export default publicProcedure
  .input(z.object({
    event: z.object({
      type: z.string(),
      data: z.object({
        object: z.any(),
      }),
    }),
    stripeSecretKey: z.string(),
  }))
  .mutation(async ({ input }) => {
    const { event, stripeSecretKey } = input;

    console.log('[Stripe Webhook] Received event:', event.type);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          console.log('[Stripe Webhook] Checkout session completed:', event.data.object);
          return {
            success: true,
            message: 'Checkout session completed',
            data: event.data.object,
          };

        case 'customer.subscription.created':
          console.log('[Stripe Webhook] Subscription created:', event.data.object);
          return {
            success: true,
            message: 'Subscription created',
            data: event.data.object,
          };

        case 'customer.subscription.updated':
          console.log('[Stripe Webhook] Subscription updated:', event.data.object);
          return {
            success: true,
            message: 'Subscription updated',
            data: event.data.object,
          };

        case 'customer.subscription.deleted':
          console.log('[Stripe Webhook] Subscription deleted:', event.data.object);
          return {
            success: true,
            message: 'Subscription deleted',
            data: event.data.object,
          };

        case 'invoice.paid':
          console.log('[Stripe Webhook] Invoice paid:', event.data.object);
          return {
            success: true,
            message: 'Invoice paid',
            data: event.data.object,
          };

        case 'invoice.payment_failed':
          console.log('[Stripe Webhook] Invoice payment failed:', event.data.object);
          return {
            success: true,
            message: 'Invoice payment failed',
            data: event.data.object,
          };

        case 'payment_intent.succeeded':
          console.log('[Stripe Webhook] Payment intent succeeded:', event.data.object);
          return {
            success: true,
            message: 'Payment intent succeeded',
            data: event.data.object,
          };

        case 'payment_intent.payment_failed':
          console.log('[Stripe Webhook] Payment intent failed:', event.data.object);
          return {
            success: true,
            message: 'Payment intent failed',
            data: event.data.object,
          };

        default:
          console.log('[Stripe Webhook] Unhandled event type:', event.type);
          return {
            success: true,
            message: 'Event received but not processed',
          };
      }
    } catch (error) {
      console.error('[Stripe Webhook] Error processing event:', error);
      throw new Error('Failed to process webhook event');
    }
  });
