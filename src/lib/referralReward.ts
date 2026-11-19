/**
 * The referral reward: when someone who joined through a member's link makes
 * their first real payment, both of them get one month free.
 *
 * "One month free" is paid as Stripe customer balance credit worth one month
 * of the plan the new member bought (a yearly plan counts as a twelfth).
 * Stripe takes credit off the next invoice by itself, so nothing here has to
 * touch a subscription, a renewal date or a price.
 *
 * Why the first PAYMENT and not the signup: a signup costs nothing to fake.
 * A reward that only exists once real money has moved cannot be farmed for
 * more than was paid in.
 *
 * Idempotent at every step, because Stripe redelivers webhooks:
 *   - referralRewards/{memberUid} is created once (create() fails if it
 *     exists), so a member can only ever trigger one reward;
 *   - each Stripe credit carries an idempotency key.
 * A referrer with no Stripe customer yet (still on a free trial) has the
 * credit parked in referralCredits/{uid} and applied on their own next paid
 * invoice.
 */
import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** At most this many rewarded referrals per member: a year of free months. */
export const MAX_REWARDS_PER_REFERRER = 12;

/** One month of a recurring price in minor units, or null if it has none. */
export function monthlyCents(price: { unit_amount?: number | null; recurring?: { interval?: string; interval_count?: number | null } | null } | null | undefined): number | null {
  const amount = price?.unit_amount ?? 0;
  const r = price?.recurring;
  if (!amount || amount <= 0 || !r?.interval) return null;
  const n = Math.max(1, r.interval_count ?? 1);
  const months = r.interval === 'year' ? 12 * n : r.interval === 'month' ? n : r.interval === 'week' ? (n * 7) / 30.4375 : r.interval === 'day' ? n / 30.4375 : 0;
  if (!months) return null;
  return Math.max(1, Math.round(amount / months));
}

/** Remembers who referred a member. The first link they used wins. */
export async function recordReferrer(db: Firestore, memberUid: string, referrerUid: string): Promise<void> {
  if (!memberUid || !referrerUid || memberUid === referrerUid) return;
  try {
    await db.collection('referredBy').doc(memberUid).create({ referrerUid, at: FieldValue.serverTimestamp() });
  } catch { /* already recorded: the first referrer keeps the credit */ }
}

async function credit(stripe: Stripe, customerId: string, cents: number, currency: string, key: string): Promise<void> {
  await stripe.customers.createBalanceTransaction(
    customerId,
    { amount: -Math.abs(cents), currency, description: 'Referral reward: one month free' },
    { idempotencyKey: key },
  );
}

/**
 * Call on every paid subscription invoice. Grants the reward the first time
 * a referred member pays anything; a no-op for everyone else.
 */
export async function grantReferralReward(db: Firestore, stripe: Stripe, a: {
  memberUid: string; memberCustomerId: string | null; amountPaidCents: number; currency: string;
  price: Parameters<typeof monthlyCents>[0];
}): Promise<'granted' | 'skipped'> {
  if (a.amountPaidCents <= 0 || !a.memberCustomerId) return 'skipped';
  const cents = monthlyCents(a.price);
  if (!cents) return 'skipped';
  const refSnap = await db.collection('referredBy').doc(a.memberUid).get();
  const referrerUid = refSnap.data()?.referrerUid as string | undefined;
  if (!referrerUid || referrerUid === a.memberUid) return 'skipped';

  const earned = await db.collection('referralRewards').where('referrerUid', '==', referrerUid).count().get();
  if (earned.data().count >= MAX_REWARDS_PER_REFERRER) return 'skipped';

  const rewardRef = db.collection('referralRewards').doc(a.memberUid);
  try {
    await rewardRef.create({ memberUid: a.memberUid, referrerUid, cents, currency: a.currency, grantedAt: FieldValue.serverTimestamp(), memberCredited: false, referrerCredited: false });
  } catch { return 'skipped'; } // this member already triggered their one reward

  await credit(stripe, a.memberCustomerId, cents, a.currency, `refreward-${a.memberUid}-member`);
  await rewardRef.set({ memberCredited: true }, { merge: true });

  const referrerCustomer = (await db.collection('users').doc(referrerUid).get()).data()?.stripeCustomerId as string | undefined;
  if (referrerCustomer) {
    try {
      await credit(stripe, referrerCustomer, cents, a.currency, `refreward-${a.memberUid}-referrer`);
      await rewardRef.set({ referrerCredited: true }, { merge: true });
      return 'granted';
    } catch (err) {
      // Most likely a currency mismatch with the referrer's own customer.
      // Park it instead of losing it.
      console.error('[referral] crediting referrer failed, parking it', err);
    }
  }
  await db.collection('referralCredits').doc(referrerUid).set(
    { pendingCents: FieldValue.increment(cents), currency: a.currency, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return 'granted';
}

/** Applies credit parked for a member who had no Stripe customer when it was earned. */
export async function applyPendingReferralCredit(db: Firestore, stripe: Stripe, uid: string, customerId: string | null): Promise<void> {
  if (!customerId) return;
  const ref = db.collection('referralCredits').doc(uid);
  // Claim the pending amount first, inside a transaction, so two webhook
  // deliveries cannot both apply it.
  const claim = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    const cents = Number(d?.pendingCents ?? 0);
    if (!d || cents <= 0) return null;
    const batch = Number(d.appliedBatches ?? 0) + 1;
    tx.set(ref, { pendingCents: 0, appliedBatches: batch, appliedCents: FieldValue.increment(cents) }, { merge: true });
    return { cents, currency: String(d.currency ?? 'usd'), batch };
  });
  if (!claim) return;
  try {
    await credit(stripe, customerId, claim.cents, claim.currency, `refcredit-${uid}-${claim.batch}`);
  } catch (err) {
    console.error('[referral] applying parked credit failed, restoring it', err);
    await ref.set({ pendingCents: FieldValue.increment(claim.cents), appliedCents: FieldValue.increment(-claim.cents) }, { merge: true });
  }
}
