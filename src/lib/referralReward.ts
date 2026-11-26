/**
 * The referral reward: when someone who joined through a member's link makes
 * their SECOND real payment, both of them get one month free.
 *
 * Why the second payment: paying once and then refunding (or charging back)
 * used to keep the free months. Waiting for a renewal makes that cost a real
 * month, and a refund or dispute afterwards takes card credit back
 * (revokeReferralReward).
 *
 * Delivery depends on how each person pays:
 *   - card (Stripe): customer balance credit, taken off the next invoice;
 *   - Google Play (RevenueCat): the next Play billing date is pushed back
 *     30 days through RevenueCat's defer endpoint (needs REVENUECAT_SECRET_KEY);
 *   - neither yet (free trial, or no key): parked and applied later.
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

/** Paid payments a referred member makes before the reward is granted. */
export const PAYMENTS_BEFORE_REWARD = 2;
/** A free month on Google Play, in days. */
export const PLAY_REWARD_DAYS = 30;

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

/** Pushes a Google Play subscription's next billing date back (RevenueCat). */
export interface PlayDeferrer { defer(uid: string, productId: string, days: number): Promise<boolean> }

/** RevenueCat REST v1: read the current expiry, then defer it by `days`. */
export function revenueCatDeferrer(secretKey: string | undefined, fetchImpl: typeof fetch = fetch): PlayDeferrer | null {
  if (!secretKey) return null;
  const h = { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };
  return {
    async defer(uid, productId, days) {
      const base = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
      const r = await fetchImpl(base, { headers: h });
      if (!r.ok) return false;
      const subs = ((await r.json()) as { subscriber?: { subscriptions?: Record<string, { expires_date?: string | null }> } }).subscriber?.subscriptions ?? {};
      const key = subs[productId] ? productId : Object.keys(subs).find((k) => k.split(':')[0] === productId.split(':')[0]);
      const exp = key ? Date.parse(subs[key]?.expires_date ?? '') : NaN;
      if (!key || !Number.isFinite(exp)) return false;
      const d = await fetchImpl(`${base}/subscriptions/${encodeURIComponent(key)}/defer`, {
        method: 'POST', headers: h, body: JSON.stringify({ expiry_time_ms: exp + days * 86_400_000 }),
      });
      return d.ok;
    },
  };
}

type Via = 'stripe' | 'play' | 'parked';

/** Gives one person their free month in whatever way they pay. */
async function deliver(db: Firestore, stripe: Stripe, play: PlayDeferrer | null, uid: string, cents: number, currency: string, key: string): Promise<Via> {
  const u = (await db.collection('users').doc(uid).get()).data() ?? {};
  const m = (u.membership ?? {}) as { source?: string; status?: string; storeProductId?: string };
  if (m.source === 'google_play' && m.status === 'active' && m.storeProductId) {
    if (play) {
      try { if (await play.defer(uid, m.storeProductId, PLAY_REWARD_DAYS)) return 'play'; }
      catch (err) { console.error('[referral] Play defer failed, parking it', err); }
    }
    await db.collection('referralCredits').doc(uid).set(
      { pendingPlayDays: FieldValue.increment(PLAY_REWARD_DAYS), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'parked';
  }
  const customer = u.stripeCustomerId as string | undefined;
  if (customer) {
    try { await credit(stripe, customer, cents, currency, key); return 'stripe'; }
    catch (err) { console.error('[referral] Stripe credit failed, parking it', err); } // most likely a currency mismatch
  }
  await db.collection('referralCredits').doc(uid).set(
    { pendingCents: FieldValue.increment(cents), currency, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return 'parked';
}

/**
 * Call on every real payment a member makes, card or Google Play. Counts the
 * payment (once per paymentId, so redelivered webhooks do not count twice)
 * and grants the reward when a referred member reaches their second one.
 */
export async function grantReferralReward(db: Firestore, stripe: Stripe, a: {
  memberUid: string; paymentId: string; cents: number | null; currency: string;
  memberCustomerId?: string | null; play?: PlayDeferrer | null;
}): Promise<'granted' | 'skipped'> {
  if (!a.cents || a.cents <= 0 || !a.paymentId) return 'skipped';
  const refRef = db.collection('referredBy').doc(a.memberUid);
  const referrerUid = (await refRef.get()).data()?.referrerUid as string | undefined;
  if (!referrerUid || referrerUid === a.memberUid) return 'skipped';
  // One reward per member, not two: a member a partner brought in earns that
  // partner a cash commission, so the member-referral free months do not
  // also pay out on them. Partner attribution wins because it is the paid
  // relationship.
  const attribution = (await db.collection('users').doc(a.memberUid).get()).data()?.attribution as { partnerId?: string; pendingPartnerId?: string } | undefined;
  if (attribution?.partnerId || attribution?.pendingPartnerId) return 'skipped';

  try { await refRef.collection('payments').doc(a.paymentId).create({ at: FieldValue.serverTimestamp(), cents: a.cents }); }
  catch { return 'skipped'; } // this payment was already counted
  const paid = (await refRef.collection('payments').count().get()).data().count;
  if (paid < PAYMENTS_BEFORE_REWARD) return 'skipped';

  const earned = await db.collection('referralRewards').where('referrerUid', '==', referrerUid).count().get();
  if (earned.data().count >= MAX_REWARDS_PER_REFERRER) return 'skipped';

  const rewardRef = db.collection('referralRewards').doc(a.memberUid);
  try {
    await rewardRef.create({ memberUid: a.memberUid, referrerUid, cents: a.cents, currency: a.currency,
      memberCustomerId: a.memberCustomerId ?? null, grantedAt: FieldValue.serverTimestamp() });
  } catch { return 'skipped'; } // this member already triggered their one reward

  const play = a.play ?? null;
  const memberVia = await deliver(db, stripe, play, a.memberUid, a.cents, a.currency, `refreward-${a.memberUid}-member`);
  await rewardRef.set({ memberVia, memberCredited: memberVia !== 'parked' }, { merge: true });
  const referrerVia = await deliver(db, stripe, play, referrerUid, a.cents, a.currency, `refreward-${a.memberUid}-referrer`);
  await rewardRef.set({ referrerVia, referrerCredited: referrerVia !== 'parked' }, { merge: true });
  return 'granted';
}

/**
 * A referred member's payment was fully refunded or disputed: take back the
 * card credit both sides got. Credit already spent shows up on their next
 * invoice. A Play deferral cannot be undone and is left as it is; it took
 * two real Play payments to earn.
 */
export async function revokeReferralReward(db: Firestore, stripe: Stripe, memberCustomerId: string): Promise<boolean> {
  const q = await db.collection('referralRewards').where('memberCustomerId', '==', memberCustomerId).limit(1).get();
  const doc = q.docs[0];
  if (!doc) return false;
  const r = doc.data() as { memberUid: string; referrerUid: string; cents: number; currency: string; memberVia?: Via; referrerVia?: Via; revoked?: boolean };
  if (r.revoked) return false;
  await doc.ref.set({ revoked: true, revokedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const [side, uid, via] of [['member', r.memberUid, r.memberVia], ['referrer', r.referrerUid, r.referrerVia]] as const) {
    if (via === 'stripe') {
      const cus = side === 'member' ? memberCustomerId : (await db.collection('users').doc(uid).get()).data()?.stripeCustomerId as string | undefined;
      if (cus) {
        await stripe.customers.createBalanceTransaction(cus,
          { amount: Math.abs(r.cents), currency: r.currency, description: 'Referral reward reversed: payment refunded' },
          { idempotencyKey: `refrevoke-${r.memberUid}-${side}` }).catch((err) => console.error('[referral] reversal failed', side, err));
      }
    } else if (via === 'parked') {
      await db.collection('referralCredits').doc(uid).set({ pendingCents: FieldValue.increment(-Math.abs(r.cents)) }, { merge: true });
    }
  }
  return true;
}

/** Applies Play days parked for a member (no key yet, or the defer failed). */
export async function applyPendingPlayDays(db: Firestore, play: PlayDeferrer | null, uid: string, productId: string): Promise<void> {
  if (!play || !productId) return;
  const ref = db.collection('referralCredits').doc(uid);
  const days = await db.runTransaction(async (tx) => {
    const n = Number((await tx.get(ref)).data()?.pendingPlayDays ?? 0);
    if (n <= 0) return 0;
    tx.set(ref, { pendingPlayDays: 0 }, { merge: true });
    return n;
  });
  if (!days) return;
  const ok = await play.defer(uid, productId, days).catch(() => false);
  if (!ok) await ref.set({ pendingPlayDays: FieldValue.increment(days) }, { merge: true });
}

/** One month of a Google Play payment, from the price and the period it bought. */
export function playMonthlyCents(price: number | null | undefined, purchasedMs: number | null | undefined, expiresMs: number | null | undefined): number | null {
  if (typeof price !== 'number' || price <= 0 || !purchasedMs || !expiresMs || expiresMs <= purchasedMs) return null;
  const months = Math.max(1, Math.round((expiresMs - purchasedMs) / (30.4375 * 86_400_000)));
  return Math.max(1, Math.round((price * 100) / months));
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
