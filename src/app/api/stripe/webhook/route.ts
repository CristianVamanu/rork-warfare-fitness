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

// 'membership' (a regular subscription plan) and 'coaching' (the 1:1
// add-on tier) are tracked in SEPARATE Firestore fields — a user can hold
// both simultaneously, as two independent Stripe subscriptions. They used
// to share one field, so buying the second while already holding the
// first silently overwrote the first's tracked subscription ID, making it
// un-cancelable through the app (and un-cancelable by account deletion,
// leaving it billing a deleted account's card forever).
type SubscriptionField = 'membership' | 'coaching';

function fieldFromMetadata(metadata: Stripe.Metadata | null | undefined): SubscriptionField {
  return metadata?.kind === 'coaching' ? 'coaching' : 'membership';
}

async function setSubscriptionStatus(
  userId: string,
  field: SubscriptionField,
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
    [`${field}.status`]: status,
    [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
    ...(expiresAt ? { [`${field}.expiresAt`]: expiresAt } : {}),
    ...(planId ? { [`${field}.planId`]: planId, [`${field}.planName`]: planName ?? '' } : {}),
    ...(subscriptionId ? { [`${field}.stripeSubscriptionId`]: subscriptionId } : {}),
    ...(cancelAtPeriodEnd !== undefined ? { [`${field}.cancelAtPeriodEnd`]: cancelAtPeriodEnd } : {}),
  });
  console.log(`[Stripe webhook] User ${userId} ${field} → ${status}${planId ? ` (plan: ${planId})` : ''}`);
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
        // But also activate here in case the subscription event fires first —
        // only once the subscription itself is actually active/trialing,
        // never just because mode is 'subscription'. `session.mode ===
        // 'subscription'` alone doesn't mean payment succeeded: a delayed
        // or failed initial charge (e.g. 3DS/SCA still pending) can still
        // fire checkout.session.completed with an incomplete subscription,
        // which would otherwise grant membership ahead of actual payment.
        if (session.payment_status === 'paid' || session.mode === 'subscription') {
          const stripe = await getStripe();
          const subId = session.subscription as string | null;
          let expiresAt: Date | undefined;
          let subActive = session.payment_status === 'paid';
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            expiresAt = subscriptionPeriodEnd(sub);
            subActive = subActive || sub.status === 'active' || sub.status === 'trialing';
          }
          if (subActive) {
            const planId = session.metadata?.planId;
            const planName = session.metadata?.planName;
            await setSubscriptionStatus(userId, fieldFromMetadata(session.metadata), 'active', expiresAt, planId, planName, subId ?? undefined, false);
            // Marks this account as having already used its trial (free or
            // paid) — see plan-checkout's alreadyUsedTrial check, which
            // stops a cancel-then-resubscribe loop from repeatedly getting
            // a fresh trial_period_days (and, for a paid trial, the
            // discounted trial fee) every time.
            if (session.metadata?.trialUsed === 'true') {
              const db = getAdminDb();
              await db?.collection('users').doc(userId).update({ trialUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
            }
          }
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
        await setSubscriptionStatus(userId, fieldFromMetadata(sub.metadata), active ? 'active' : 'none', expiresAt, planId, planName, sub.id, sub.cancel_at_period_end);
        break;
      }

      // ── Subscription cancelled or lapsed ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] subscription.deleted: no userId in metadata'); break; }
        await setSubscriptionStatus(userId, fieldFromMetadata(sub.metadata), 'none');
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
        // Always a fresh retrieve with invoice expanded, even when the event
        // payload already embedded a full charge object — live testing found
        // the EMBEDDED charge.refunded event's object had `invoice: null`
        // despite the Dashboard clearly showing this exact charge tied to a
        // real invoice/subscription. Whatever API-version quirk causes that
        // (this account's events also show the newer `invoice_payment.*`
        // event family alongside classic `invoice.*` ones, suggesting an
        // in-progress Stripe migration), a live retrieve+expand is more
        // reliable than trusting whatever was embedded in the webhook body.
        const chargeId = typeof charge === 'string' ? charge : charge.id;
        const chargeObj = await stripe.charges.retrieve(chargeId, { expand: ['invoice'] });

        // A dispute is always treated as full-severity regardless of amount
        // (it's a fraud/risk signal, not a refund amount question), but a
        // plain refund only revokes access when the WHOLE charge was
        // refunded — chargeObj.refunded is Stripe's own "fully refunded"
        // flag, false for partial refunds. Without this gate, a small
        // partial refund issued for a billing dispute on one invoice would
        // fully kill an otherwise-still-paying, still-active membership.
        const isFullSeverity = event.type === 'charge.dispute.created' || chargeObj.refunded === true;
        if (!isFullSeverity) {
          console.log(`[Stripe webhook] Partial refund on charge ${chargeObj.id} — access not revoked`);
          break;
        }

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

        // Subscription-based charge — trace back to find which subscription/
        // user this charge belongs to. `invoice` is expanded above, so it's
        // already the full object when present — no second retrieve needed.
        const expandedInvoice = (chargeObj as { invoice?: string | Stripe.Invoice | null }).invoice;
        const invoice = expandedInvoice && typeof expandedInvoice === 'object' ? expandedInvoice : null;
        let subId = invoice ? (invoice as { subscription?: string | null }).subscription : null;

        // Live testing found charge.invoice comes back null even with an
        // explicit expand — this account's newer API version apparently
        // doesn't populate that relationship for these charges at all (not
        // a payload issue; a fresh retrieve+expand still returned null).
        // Falls back to the one thing every charge always has: its
        // customer. A customer normally holds exactly one live membership
        // subscription at a time in this app, so the most recently created
        // non-canceled one for that customer is the right target.
        if (!subId) {
          const customerId = typeof chargeObj.customer === 'string' ? chargeObj.customer : chargeObj.customer?.id;
          if (customerId) {
            const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
            const candidate = subs.data
              .filter((s) => s.status !== 'canceled')
              .sort((a, b) => b.created - a.created)[0];
            if (candidate) {
              subId = candidate.id;
              console.log(`[Stripe webhook] ${event.type}: charge ${chargeObj.id} had no invoice — found subscription ${subId} via customer ${customerId} instead`);
            }
          }
        }

        if (!subId) {
          console.log(`[Stripe webhook] ${event.type}: charge ${chargeObj.id} — could not resolve a subscription to revoke`);
        }
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const userId = sub.metadata?.userId;
          if (!userId) {
            console.log(`[Stripe webhook] ${event.type}: subscription ${subId} has no userId in metadata — nothing to revoke`);
          }
          if (userId) {
            const field = fieldFromMetadata(sub.metadata);
            await setSubscriptionStatus(userId, field, 'none');
            // Firestore status alone doesn't stop Stripe from continuing
            // to bill this subscription — a refund/dispute is exactly the
            // moment we want that to stop, not just hide app access while
            // the card keeps getting charged every cycle.
            console.log(`[Stripe webhook] ${event.type}: subscription ${subId} current status is "${sub.status}" (cancel_at_period_end=${sub.cancel_at_period_end})`);
            if (sub.status !== 'canceled') {
              try {
                const cancelled = await stripe.subscriptions.cancel(subId);
                console.log(`[Stripe webhook] Cancel call returned status "${cancelled.status}" for subscription ${subId}`);
              } catch (cancelErr) {
                const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
                console.error(`[Stripe webhook] Failed to cancel subscription ${subId} for user ${userId}: ${msg}`, cancelErr);
              }
            } else {
              console.log(`[Stripe webhook] Subscription ${subId} already canceled — skipping cancel call`);
            }
            console.log(`[Stripe webhook] Revoked ${field} for user ${userId} (${event.type})`);
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
