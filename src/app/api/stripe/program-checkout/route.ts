export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One-time purchase checkout for an individual program (alternative to membership gating). */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getOrCreateStripeCustomer } from '@/lib/stripeCustomer';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getOrCreateProgramProduct } from '@/lib/stripeProducts';
import type { Program } from '@/types';

export async function POST(req: NextRequest) {
  // Verifies the caller's own login token — see plan-checkout/route.ts.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const userId = authCheck.uid;

  try {
    const { userEmail, programId } = await req.json() as { userEmail: string; programId: string };
    if (!programId) return NextResponse.json({ error: 'programId required' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    const db = getAdminDb(app);

    const progSnap = await db.collection('programs').doc(programId).get();
    if (!progSnap.exists) return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    const program = progSnap.data() as Program;
    if (!program.price || program.price <= 0) return NextResponse.json({ error: 'Program price not set' }, { status: 400 });

    // Unlike plan-checkout (which already rejects a duplicate subscription
    // attempt), this had no equivalent check — a double-click or a retry on
    // a slow connection could create two separate Checkout Sessions for the
    // same one-time program purchase, charging the user twice for
    // something they already own.
    const userSnap = await db.collection('users').doc(userId).get();
    const purchasedIds = (userSnap.data()?.purchasedProgramIds ?? []) as string[];
    if (purchasedIds.includes(programId)) {
      return NextResponse.json({ error: 'You already own this program.' }, { status: 400 });
    }

    const stripe = await getStripe();
    // One durable Customer per account, instead of customer_email making
    // Stripe mint a fresh one on every checkout — which split a single
    // member's cards and invoices across several customers and left
    // anyone without a live subscription unable to reach their billing.
    const customerId = await getOrCreateStripeCustomer({
      db, stripe, uid: userId, email: userEmail,
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    // Permanent product, same reasoning and same inline fallback as the
    // subscription checkouts. Without this the catalogue kept one throwaway
    // product per program sale, and a code could never be limited to a
    // single program.
    let programProduct: string | null = null;
    try {
      programProduct = await getOrCreateProgramProduct(stripe, programId, program.name);
    } catch (err) {
      console.warn('[program-checkout] could not resolve a permanent product, using an inline one:', err instanceof Error ? err.message : err);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(program.price * 100),
            ...(programProduct
              ? { product: programProduct }
              : { product_data: { name: program.name } }),
          },
        },
      ],
      metadata: { userId, programId, kind: 'program_purchase' },
      // Also set on the PaymentIntent (not just the Checkout Session) —
      // a refund/dispute webhook only ever sees the Charge/PaymentIntent,
      // not the original session, so without this a refund can't be traced
      // back to which user/program to revoke access for.
      payment_intent_data: { metadata: { userId, programId, kind: 'program_purchase' } },
      // The membership and coaching checkouts already offer this; a one-off
      // program purchase silently ignored every code, so a member handed a
      // forces discount could spend it on a plan but not on a single program
      // and had no way of knowing why. Nothing here applies an automatic
      // discount, so unlike the plan checkout there is no case where this has
      // to be withheld: Stripe will not show a code box beside one it applied
      // itself.
      allow_promotion_codes: true,
      success_url: `${appUrl}/training/${programId}?purchased=1`,
      cancel_url: `${appUrl}/training/${programId}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[program-checkout] Stripe error:', err instanceof Error ? err.message : err);
    const msg = 'Could not start checkout right now. Try again in a moment.';
    console.error('[Stripe] program-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
