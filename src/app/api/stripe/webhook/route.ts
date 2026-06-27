export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

function getAdminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

async function setMembershipStatus(userId: string, status: 'active' | 'none', expiresAt?: Date) {
  const db = getAdminDb();
  if (!db) { console.error('[Stripe webhook] Admin DB not available'); return; }
  await db.collection('users').doc(userId).update({
    'membership.status': status,
    'membership.updatedAt': FieldValue.serverTimestamp(),
    ...(expiresAt ? { 'membership.expiresAt': expiresAt } : {}),
  });
  console.log(`[Stripe webhook] User ${userId} membership → ${status}`);
}

export async function POST(req: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') ?? '';
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed';
    console.error('[Stripe webhook] Verification failed:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── User subscribes successfully ────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] checkout.session.completed: no userId in metadata'); break; }

        // For subscription mode, activation is confirmed via subscription.updated below.
        // But also activate here in case the subscription event fires first.
        if (session.payment_status === 'paid' || session.mode === 'subscription') {
          const stripe = getStripe();
          const subId = session.subscription as string | null;
          let expiresAt: Date | undefined;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            expiresAt = new Date(sub.current_period_end * 1000);
          }
          await setMembershipStatus(userId, 'active', expiresAt);
        }
        break;
      }

      // ── Subscription activated or renewed ───────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] subscription event: no userId in metadata'); break; }

        const active = sub.status === 'active' || sub.status === 'trialing';
        const expiresAt = new Date(sub.current_period_end * 1000);
        await setMembershipStatus(userId, active ? 'active' : 'none', expiresAt);
        break;
      }

      // ── Subscription cancelled or lapsed ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] subscription.deleted: no userId in metadata'); break; }
        await setMembershipStatus(userId, 'none');
        break;
      }

      // ── Payment failed — warn but don't deactivate immediately ──────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as { subscription?: string }).subscription;
        if (subId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subId);
          const userId = sub.metadata?.userId;
          if (userId) console.warn(`[Stripe webhook] Payment failed for user ${userId} — subscription status: ${sub.status}`);
        }
        break;
      }

      default:
        // Unhandled event — safe to ignore
    }
  } catch (err) {
    console.error('[Stripe webhook] Handler error:', err);
    // Still return 200 so Stripe doesn't retry unnecessarily
  }

  return NextResponse.json({ received: true });
}
