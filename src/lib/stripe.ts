/**
 * Server-only Stripe helpers.
 * Import only from API routes — never from client components.
 */

import Stripe from 'stripe';
import { getSecret } from '@/lib/secrets';

export async function getStripe(): Promise<Stripe> {
  const key = await getSecret('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (Stripe as any)(key, { apiVersion: '2024-06-20' });
}

export async function getStripeWebhookSecret(): Promise<string> {
  const secret = await getSecret('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  return secret;
}
