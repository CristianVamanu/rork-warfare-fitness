export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Stripe publishable key for Stripe.js on /checkout.
 *
 * Public by definition (it is the key that goes in the browser), so no
 * auth. Served from an endpoint rather than baked into the bundle because
 * the admin panel can store it in system/secrets at runtime — a
 * NEXT_PUBLIC_ variable is frozen at build time and would silently ignore
 * that. Falls back to the env var, so either place works.
 *
 * Only ever returns a pk_ key: a secret key put in the wrong box by mistake
 * would otherwise be handed to every visitor.
 */

import { NextResponse } from 'next/server';
import { getSecret } from '@/lib/secrets';

export async function GET() {
  let key: string | null = null;
  try { key = await getSecret('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'); } catch { /* fall back to env */ }
  key = key || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;

  if (!key || !/^pk_(live|test)_[A-Za-z0-9]+$/.test(key)) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
