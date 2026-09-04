export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { sendEmail, paymentFailedEmailHtml, trialEndingEmailHtml } from '@/lib/email';
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
  markTrialUsed?: boolean,
) {
  const db = getAdminDb();
  if (!db) { console.error('[Stripe webhook] Admin DB not available'); return; }
  // set(merge) rather than update(): update() throws NOT_FOUND if the user
  // doc is gone (deleted account with a live subscription), which turned a
  // dead-letter case into three days of pointless Stripe retries.
  await db.collection('users').doc(userId).set({
    // trialUsedAt is the ONLY thing stopping cancel-and-resubscribe from
    // earning a fresh discounted trial every cycle (see plan-checkout's
    // alreadyUsedTrial). It used to be a separate fire-and-forget write with
    // `.catch(() => {})`, so if it failed the error was swallowed, the
    // webhook still answered 200, Stripe never retried, and the guard was
    // silently absent for that account forever. Folded into this same write
    // so it is atomic with the grant and a failure earns a retry.
    ...(markTrialUsed ? { trialUsedAt: FieldValue.serverTimestamp() } : {}),
    [`${field}.status`]: status,
    [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
    ...(expiresAt ? { [`${field}.expiresAt`]: expiresAt } : {}),
    ...(planId ? { [`${field}.planId`]: planId, [`${field}.planName`]: planName ?? '' } : {}),
    ...(subscriptionId ? { [`${field}.stripeSubscriptionId`]: subscriptionId } : {}),
    ...(cancelAtPeriodEnd !== undefined ? { [`${field}.cancelAtPeriodEnd`]: cancelAtPeriodEnd } : {}),
  }, { merge: true });
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

  // Stripe delivers at least once, and retries anything that isn't a 2xx —
  // including our own deliberate 500s. The handlers below are individually
  // idempotent (status overwrites, arrayUnion/arrayRemove, a cancel guarded
  // on not-already-canceled), with one exception that was reaching real
  // customers: invoice.payment_failed sends an email every time it runs, so
  // a retry meant a second "your payment failed" message. This ledger makes
  // the whole switch exactly-once, and stops the next handler anyone adds
  // from having to rediscover the problem.
  //
  // The marker is written only AFTER the handler succeeds, so a failed
  // attempt still earns its retry.
  const eventLedger = getAdminDb()?.collection('stripeEvents').doc(event.id);
  if (eventLedger) {
    try {
      if ((await eventLedger.get()).exists) {
        console.log(`[Stripe webhook] Duplicate delivery of ${event.id} (${event.type}) — already processed`);
        return NextResponse.json({ received: true, duplicate: true });
      }
    } catch (err) {
      // Can't read the ledger — fall through and handle it. Re-running an
      // idempotent handler is strictly better than dropping a real event.
      console.error('[Stripe webhook] Ledger read failed, processing anyway:', err);
    }
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
            await setSubscriptionStatus(
              userId, fieldFromMetadata(session.metadata), 'active', expiresAt, planId, planName,
              subId ?? undefined, false,
              session.metadata?.trialUsed === 'true',
            );
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

        // 'past_due' is Stripe still auto-retrying a failed renewal charge —
        // treated as still-active so a single declined card (expired card,
        // bank hiccup) doesn't instantly revoke a paying member's access.
        // This event fires alongside invoice.payment_failed on the very
        // first missed payment; that handler's own comment says "warn but
        // don't deactivate immediately" — this used to silently contradict
        // it by deactivating right here regardless. Real lapses still end
        // access via customer.subscription.deleted once Stripe's retries
        // are exhausted (status becomes 'unpaid'/'canceled'), same as today.
        const active = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
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
      // ── Invoice actually paid — renewal or recovery ─────────────────────
      // Renewals normally land through customer.subscription.updated, which
      // refreshes expiresAt, so this is redundancy rather than a hole. The
      // case it genuinely covers is recovery: a member whose card failed sits
      // in past_due (treated as still-active on purpose), updates their card,
      // Stripe retries and succeeds — and if the accompanying subscription
      // event is ever missed, their stored expiresAt stays stale until
      // MEMBERSHIP_GRACE_MS runs out and locks out somebody who has paid.
      //
      // Re-reads the subscription rather than trusting the invoice's own
      // period fields, so status and period end come from one source.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as { subscription?: string | Stripe.Subscription }).subscription;
        const subscriptionId = typeof subId === 'string' ? subId : subId?.id;
        // One-off invoices (a program purchase) have no subscription and are
        // handled by checkout.session.completed — nothing to do here.
        if (!subscriptionId) break;
        const stripe = await getStripe();
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] invoice.paid: no userId in metadata'); break; }
        const active = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
        await setSubscriptionStatus(
          userId,
          fieldFromMetadata(sub.metadata),
          active ? 'active' : 'none',
          subscriptionPeriodEnd(sub),
          sub.metadata?.planId,
          sub.metadata?.planName,
          sub.id,
          sub.cancel_at_period_end,
        );
        break;
      }

      // ── Stripe trial about to convert (fires ~3 days out) ───────────────
      // Under a Stripe-managed trial the app's own createdAt-anchored
      // "your trial ends in 2 days" mail is deliberately suppressed (see
      // notifications/process), because there is no such window to warn
      // about. Without this handler that left the card-up-front flow giving
      // NO notice at all before the first real charge — the surest way to
      // turn a converting trial into a chargeback, and in several
      // jurisdictions a notice requirement rather than a courtesy.
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn('[Stripe webhook] trial_will_end: no userId in metadata'); break; }
        const db = getAdminDb();
        if (!db) break;
        const [userSnap, cfgSnap] = await Promise.all([
          db.collection('users').doc(userId).get(),
          db.collection('system').doc('config').get(),
        ]);
        const userEmail = userSnap.data()?.email as string | undefined;
        if (!userEmail) break;
        const trialEndMs = (sub.trial_end ?? 0) * 1000;
        const daysLeft = Math.max(1, Math.ceil((trialEndMs - Date.now()) / (24 * 60 * 60 * 1000)));
        const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
        await sendEmail({
          to: userEmail,
          subject: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          html: trialEndingEmailHtml(userSnap.data()?.displayName?.split(' ')[0] || 'there', daysLeft, appName, appUrl),
        });
        break;
      }

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
        // Falls back to the one thing every charge always has: its customer.
        if (!subId) {
          const customerId = typeof chargeObj.customer === 'string' ? chargeObj.customer : chargeObj.customer?.id;
          if (customerId) {
            const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
            const nonCanceled = subs.data.filter((s) => s.status !== 'canceled');
            if (nonCanceled.length === 1) {
              subId = nonCanceled[0].id;
              console.log(`[Stripe webhook] ${event.type}: charge ${chargeObj.id} had no invoice — found subscription ${subId} via customer ${customerId} (only one live subscription)`);
            } else if (nonCanceled.length > 1) {
              // A customer can hold BOTH a membership and a coaching
              // subscription at once (see fieldFromMetadata above) — just
              // picking "most recent" here would risk cancelling the WRONG
              // one (e.g. refunding an old membership charge but cancelling
              // a newer, unrelated, still-paid-for coaching subscription).
              // Disambiguate for real: check each candidate subscription's
              // own invoice history for one whose charge actually matches.
              for (const candidate of nonCanceled) {
                const invoices = await stripe.invoices.list({ subscription: candidate.id, limit: 20 });
                const match = invoices.data.find((inv) => {
                  const invCharge = (inv as { charge?: string | Stripe.Charge | null }).charge;
                  const invChargeId = typeof invCharge === 'string' ? invCharge : invCharge?.id;
                  return invChargeId === chargeObj.id;
                });
                if (match) {
                  subId = candidate.id;
                  break;
                }
              }
              if (subId) {
                console.log(`[Stripe webhook] ${event.type}: charge ${chargeObj.id} — disambiguated to subscription ${subId} among ${nonCanceled.length} live subscriptions for customer ${customerId}`);
              } else {
                // Couldn't find a match anywhere — refuse to guess. Cancelling
                // the wrong one of two live subscriptions is worse than
                // leaving this event for manual follow-up.
                console.error(`[Stripe webhook] ${event.type}: charge ${chargeObj.id} — customer ${customerId} has ${nonCanceled.length} live subscriptions and none of their invoices matched this charge. Refusing to guess; needs manual review.`);
              }
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

      // A won dispute doesn't undo anything automatically — the underlying
      // subscription was already hard-cancelled by charge.dispute.created
      // above, and there's no safe way to silently recreate a subscription
      // or grant access back without a fresh payment method/checkout. This
      // just surfaces it loudly so staff know to follow up manually instead
      // of the account quietly staying revoked forever with no record of
      // why it might now deserve reinstating.
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.status === 'won') {
          const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
          console.error(`[Stripe webhook] Dispute WON (merchant) for charge ${chargeId} — access was previously revoked by charge.dispute.created and is NOT auto-restored. Manual review needed if this customer should be reinstated.`);
        }
        break;
      }

      default:
        // Unhandled event — safe to ignore
    }
  } catch (err) {
    // Return 500 so Stripe RETRIES. This used to swallow the error and
    // answer 200 "so Stripe doesn't retry unnecessarily", which quietly
    // made every handler failure permanent: a customer.subscription.deleted
    // arriving during a brief Firestore/admin-SDK blip was marked delivered
    // by Stripe and never resent, leaving membership.status 'active'
    // forever — full access, no subscription, and nothing anywhere that
    // reconciles it afterwards (membership.expiresAt is written but never
    // actually evaluated by any access check).
    //
    // Retrying is safe here: every handler is idempotent — setSubscriptionStatus
    // only overwrites fields, arrayUnion/arrayRemove are naturally
    // idempotent, and the refund/dispute path guards its cancel call on the
    // subscription not already being canceled. A duplicate delivery
    // re-applies the same end state rather than compounding.
    console.error('[Stripe webhook] Handler error — returning 500 so Stripe retries:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  // Marked only on success — see the ledger comment above.
  if (eventLedger) {
    await eventLedger.set({
      type: event.type,
      processedAt: FieldValue.serverTimestamp(),
      // Lets a TTL policy on stripeEvents.expiresAt sweep these; Stripe never
      // retries beyond ~3 days, so a 30-day window is generous.
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).catch((err) => console.error('[Stripe webhook] Ledger write failed:', err));
  }

  return NextResponse.json({ received: true });
}
