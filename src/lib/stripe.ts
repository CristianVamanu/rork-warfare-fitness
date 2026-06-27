/**
 * Server-only Stripe helpers.
 * Import only from API routes — never from client components.
 */

import Stripe from 'stripe';

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _stripe = new (Stripe as any)(key, { apiVersion: '2024-06-20' });
  return _stripe!;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
  return secret;
}
