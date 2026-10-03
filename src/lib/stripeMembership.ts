// No 'server-only' marker: this file is imported only by API route handlers,
// which are already server-side, and the marker breaks the webhook unit
// tests that mock the Firestore SDK.
import { FieldValue, FieldPath, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

/**
 * The one writer of membership and coaching status from Stripe.
 *
 * Used by the webhook (the durable source of truth) and by the checkout
 * return route (so a member who has just paid is unlocked the moment they
 * are back, instead of watching "setting up your access" until the
 * webhook arrives). Both go through the same ordering guard, so whichever
 * is older can never overwrite whichever is newer.
 */

export type SubscriptionField = 'membership' | 'coaching';

export function fieldFromMetadata(metadata: Stripe.Metadata | null | undefined): SubscriptionField {
  return metadata?.kind === 'coaching' ? 'coaching' : 'membership';
}

// current_period_end moved off the top-level Subscription object onto its
// line items in API versions from late 2024 onward — check both.
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const periodEnd = sub.current_period_end
    ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : undefined;
}

export async function setSubscriptionStatus(
  db: Firestore,
  userId: string,
  field: SubscriptionField,
  status: 'active' | 'none',
  expiresAt?: Date,
  planId?: string,
  planName?: string,
  subscriptionId?: string,
  cancelAtPeriodEnd?: boolean,
  markTrialUsed?: boolean,
  /** `event.created` of the Stripe event being applied — drives the ordering guard below. */
  eventCreated?: number,
  /** Who is writing, for the log line. */
  source: string = 'Stripe webhook',
): Promise<boolean> {
  // set(merge) rather than update(): update() throws NOT_FOUND if the user
  // doc is gone (deleted account with a live subscription), which turned a
  // dead-letter case into three days of pointless Stripe retries.
  // A NESTED OBJECT, not dotted keys. update() reads "membership.status" as a
  // path into a map; set() does not — it writes a top-level field whose NAME
  // contains a dot. set(merge) deep-merges maps, so omitted keys inside this
  // object are preserved.
  const record: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(planId ? { planId, planName: planName ?? '' } : {}),
    ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    ...(cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd } : {}),
  };
  // Ordering guard. Stripe does not guarantee delivery order, and the event
  // ledger only dedupes replays of the SAME event id. Each record remembers
  // the `created` time of the last event applied to it; anything older is
  // discarded. Done in a transaction so two deliveries racing can't both
  // pass the check.
  const userRef = db.collection('users').doc(userId);
  const applied = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const prev = (snap.data()?.[field] as { lastEventCreated?: number } | undefined)?.lastEventCreated;
    if (eventCreated && prev && eventCreated < prev) return false;
    tx.set(userRef, {
      // trialUsedAt is the ONLY thing stopping cancel-and-resubscribe from
      // earning a fresh discounted trial every cycle. Folded into this same
      // write so it is atomic with the grant.
      ...(markTrialUsed ? { trialUsedAt: FieldValue.serverTimestamp() } : {}),
      [field]: { ...record, ...(eventCreated ? { lastEventCreated: eventCreated } : {}) },
    }, { merge: true });
    return true;
  });
  if (!applied) {
    console.warn(`[${source}] Discarded out-of-order event (created ${eventCreated}) for ${userId}/${field} — a newer one was already applied`);
    return false;
  }

  // Best-effort removal of the bogus dotted fields the old shape wrote.
  try {
    await userRef.update(
      new FieldPath(`${field}.status`), FieldValue.delete(),
      new FieldPath(`${field}.updatedAt`), FieldValue.delete(),
      new FieldPath(`${field}.expiresAt`), FieldValue.delete(),
      new FieldPath(`${field}.planId`), FieldValue.delete(),
      new FieldPath(`${field}.planName`), FieldValue.delete(),
      new FieldPath(`${field}.stripeSubscriptionId`), FieldValue.delete(),
      new FieldPath(`${field}.cancelAtPeriodEnd`), FieldValue.delete(),
    );
  } catch {
    // Doc missing, or nothing to clean. Never fail the grant over tidying.
  }
  console.log(`[${source}] User ${userId} ${field} → ${status}${planId ? ` (plan: ${planId})` : ''}`);
  return true;
}

/**
 * Grant from a finished Checkout Session, exactly as the webhook would.
 *
 * Only when Stripe itself says the session is complete AND the money is
 * in (paid, or a subscription that is active or trialing). An incomplete
 * subscription (3DS still pending, a declined first charge) grants nothing.
 * Returns true when access was written.
 */
export async function grantFromCheckoutSession(
  db: Firestore,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  source: string,
): Promise<boolean> {
  const userId = session.metadata?.userId;
  if (!userId || session.status !== 'complete') return false;
  if (session.metadata?.kind === 'program_purchase') return false;
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  let expiresAt: Date | undefined;
  let subActive = session.payment_status === 'paid';
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    expiresAt = subscriptionPeriodEnd(sub);
    subActive = subActive || sub.status === 'active' || sub.status === 'trialing';
  }
  if (!subActive) return false;
  return setSubscriptionStatus(
    db, userId, fieldFromMetadata(session.metadata), 'active', expiresAt,
    session.metadata?.planId, session.metadata?.planName, subId ?? undefined, false,
    session.metadata?.trialUsed === 'true',
    // Ordered by when the session was created: every webhook event about
    // this subscription is newer, so none of them is ever discarded in
    // favour of this write.
    session.created,
    source,
  );
}
