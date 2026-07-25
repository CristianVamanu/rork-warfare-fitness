export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { sendEmail, paymentFailedEmailHtml } from '@/lib/email';
import type Stripe from 'stripe';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

// current_period_end moved off the top-level Subscription object onto its
// line items in API versions from late 2024 onward — check both.
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const periodEnd = sub.current_period_end
    ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : undefined;
}

async function setMembershipStatus(
  userId: string,
  status: 'active' | 'none',
  expiresAt?: Date,
  planId?: string,
  planName?: string,
  subscriptionId?: string,
  cancelAtPeriodEnd?: boolean,
) {
  const db = getAdminDb();
  if (!db) { console.error('[Stripe webhook] Admin DB not available'); return; }
  await db.collection('users').doc(userId).update({
    'membership.status': status,
    'membership.updatedAt': FieldValue.serverTimestamp(),
    ...(expiresAt ? { 'membership.expiresAt': expiresAt } : {}),
    ...(planId ? { 'membership.planId': planId, 'membership.planName': planName ?? '' } : {}),
    ...(subscriptionId ? { 'membership.stripeSubscriptionId': subscriptionId } : {}),
    ...(cancelAtPeriodEnd !== undefined ? { 'membership.cancelAtPeriodEnd': cancelAtPeriodEnd } : {}),
  });
  console.log(`[Stripe webhook] User ${userId} membership → ${status}${planId ? ` (plan: ${planId})` : ''}`);
}

export async function POST(req: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') ?? '';
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(body, sig, await getStripeWebhookSecret());
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

        // One-time individual program purchase (not a subscription)
        if (session.metadata?.kind === 'program_purchase' && session.payment_status === 'paid') {
          const programId = session.metadata?.programId;
          if (programId) {
            const db = getAdminDb();
            if (db) {
              await db.collection('users').doc(userId).update({
                purchasedProgramIds: FieldValue.arrayUnion(programId),
              });
              console.log(`[Stripe webhook] User ${userId} purchased program ${programId}`);
            }
          }
          break;
        }

        // For subscription mode, activation is confirmed via subscription.updated below.
        // But also activate here in case the subscription event fires first.
        if (session.payment_status === 'paid' || session.mode === 'subscription') {
          const stripe = await getStripe();
          const subId = session.subscription as string | null;
          let expiresAt: Date | undefined;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            expiresAt = subscriptionPeriodEnd(sub);
          }
          const planId = session.metadata?.planId;
          const planName = session.metadata?.planName;
          await setMembershipStatus(userId, 'active', expiresAt, planId, planName, subId ?? undefined, false);
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
        const expiresAt = subscriptionPeriodEnd(sub);
        const planId = sub.metadata?.planId;
        const planName = sub.metadata?.planName;
        await setMembershipStatus(userId, active ? 'active' : 'none', expiresAt, planId, planName, sub.id, sub.cancel_at_period_end);
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
          const stripe = await getStripe();
          const sub = await stripe.subscriptions.retrieve(subId);
          const userId = sub.metadata?.userId;
          if (userId) {
            console.warn(`[Stripe webhook] Payment failed for user ${userId} — subscription status: ${sub.status}`);
            const db = getAdminDb();
            if (db) {
              const [userSnap, cfgSnap] = await Promise.all([
                db.collection('users').doc(userId).get(),
                db.collection('system').doc('config').get(),
              ]);
              const userEmail = userSnap.data()?.email as string | undefined;
              if (userEmail) {
                const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
                await sendEmail({
                  to: userEmail,
                  subject: 'Payment failed — please update your billing info',
                  html: paymentFailedEmailHtml(userSnap.data()?.displayName?.split(' ')[0] || 'there', appName, appUrl),
                });
              }
            }
          }
        }
        break;
      }

      // ── Refund or dispute — revoke whatever access that charge granted ──
      // Previously unhandled: a refunded or disputed charge left the buyer
      // with permanent access (subscription or one-time program purchase)
      // since nothing ever told the app the payment was reversed.
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = event.type === 'charge.dispute.created'
          ? (event.data.object as Stripe.Dispute).charge as string | Stripe.Charge
          : event.data.object as Stripe.Charge;
        const stripe = await getStripe();
        const chargeObj = typeof charge === 'string' ? await stripe.charges.retrieve(charge) : charge;

        const piId = typeof chargeObj.payment_intent === 'string' ? chargeObj.payment_intent : chargeObj.payment_intent?.id;
        const piMetadata = piId ? (await stripe.paymentIntents.retrieve(piId)).metadata : chargeObj.metadata;

        if (piMetadata?.kind === 'program_purchase' && piMetadata.userId && piMetadata.programId) {
          const db = getAdminDb();
          if (db) {
            await db.collection('users').doc(piMetadata.userId).update({
              purchasedProgramIds: FieldValue.arrayRemove(piMetadata.programId),
            });
            console.log(`[Stripe webhook] Revoked program ${piMetadata.programId} from user ${piMetadata.userId} (${event.type})`);
          }
          break;
        }

        // Subscription-based charge — trace back through the invoice to find
        // which subscription/user this charge belongs to.
        const invoiceId = (chargeObj as { invoice?: string | null }).invoice;
        if (invoiceId) {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          const subId = (invoice as { subscription?: string | null }).subscription;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            const userId = sub.metadata?.userId;
            if (userId) {
              await setMembershipStatus(userId, 'none');
              console.log(`[Stripe webhook] Revoked membership for user ${userId} (${event.type})`);
            }
          }
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
