import { describe, it, expect, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));

import { monthlyCents, recordReferrer, grantReferralReward, applyPendingReferralCredit, applyPendingPlayDays, revokeReferralReward, playMonthlyCents } from './referralReward';

const monthly = { unit_amount: 4900, recurring: { interval: 'month', interval_count: 1 } };
const fakeStripe = () => { const createBalanceTransaction = vi.fn(async () => ({})); return { stripe: { customers: { createBalanceTransaction } } as never, calls: createBalanceTransaction }; };

describe('referral reward', () => {
  it('works out one month of any plan', () => {
    expect(monthlyCents(monthly)).toBe(4900);
    expect(monthlyCents({ unit_amount: 49000, recurring: { interval: 'year', interval_count: 1 } })).toBe(4083);
    expect(monthlyCents({ unit_amount: 12000, recurring: { interval: 'month', interval_count: 3 } })).toBe(4000);
    expect(monthlyCents({ unit_amount: 4900, recurring: null })).toBeNull();
    expect(monthlyCents(null)).toBeNull();
  });
  const pay = (n: number, extra = {}) => ({ memberUid: 'new', memberCustomerId: 'cus_new', paymentId: `inv${n}`, cents: 4900, currency: 'usd', ...extra });

  it('waits for the second real payment, then credits both sides once', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({ stripeCustomerId: 'cus_ref' });
    await db.collection('users').doc('new').set({ stripeCustomerId: 'cus_new' });
    await recordReferrer(db as never, 'new', 'ref');
    expect(await grantReferralReward(db as never, stripe, pay(0, { cents: null }))).toBe('skipped');
    expect(await grantReferralReward(db as never, stripe, pay(1))).toBe('skipped');
    expect(await grantReferralReward(db as never, stripe, pay(1))).toBe('skipped'); // redelivered webhook
    expect(calls).not.toHaveBeenCalled();
    expect(await grantReferralReward(db as never, stripe, pay(2))).toBe('granted');
    expect(await grantReferralReward(db as never, stripe, pay(3))).toBe('skipped');
    expect(calls.mock.calls.map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as { amount: number }).amount])).toEqual([['cus_new', -4900], ['cus_ref', -4900]]);
  });
  it('does nothing without a referrer, and the first referrer wins', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    for (const n of [1, 2]) expect(await grantReferralReward(db as never, stripe, { ...pay(n), memberUid: 'solo' })).toBe('skipped');
    await recordReferrer(db as never, 'm', 'a'); await recordReferrer(db as never, 'm', 'b'); await recordReferrer(db as never, 'm', 'm');
    expect((await db.collection('referredBy').doc('m').get()).data()?.referrerUid).toBe('a');
    expect(calls).not.toHaveBeenCalled();
  });
  it('parks the credit for a referrer with no card yet and applies it once later', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({});
    await db.collection('users').doc('new').set({ stripeCustomerId: 'cus_new' });
    await recordReferrer(db as never, 'new', 'ref');
    await grantReferralReward(db as never, stripe, pay(1)); await grantReferralReward(db as never, stripe, pay(2));
    expect(calls).toHaveBeenCalledTimes(1);
    expect((await db.collection('referralCredits').doc('ref').get()).data()?.pendingCents).toBe(4900);
    await applyPendingReferralCredit(db as never, stripe, 'ref', 'cus_ref');
    await applyPendingReferralCredit(db as never, stripe, 'ref', 'cus_ref');
    expect(calls).toHaveBeenCalledTimes(2);
    expect((await db.collection('referralCredits').doc('ref').get()).data()?.pendingCents).toBe(0);
  });
  it('gives a Google Play member a deferred billing date instead of card credit', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    const defer = vi.fn(async () => true);
    await db.collection('users').doc('ref').set({ stripeCustomerId: 'cus_ref' });
    await db.collection('users').doc('new').set({ membership: { source: 'google_play', status: 'active', storeProductId: 'pro:monthly' } });
    await recordReferrer(db as never, 'new', 'ref');
    const p = { ...pay(1), memberCustomerId: null, play: { defer } };
    await grantReferralReward(db as never, stripe, p);
    expect(await grantReferralReward(db as never, stripe, { ...p, paymentId: 'inv2' })).toBe('granted');
    expect(defer).toHaveBeenCalledWith('new', 'pro:monthly', 30);
    expect(calls.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['cus_ref']);
  });
  it('parks Play days when there is no RevenueCat key, and applies them later', async () => {
    const db = makeAdminDb(); const { stripe } = fakeStripe();
    await db.collection('users').doc('ref').set({ membership: { source: 'google_play', status: 'active', storeProductId: 'pro' } });
    await db.collection('users').doc('new').set({ stripeCustomerId: 'cus_new' });
    await recordReferrer(db as never, 'new', 'ref');
    await grantReferralReward(db as never, stripe, pay(1)); await grantReferralReward(db as never, stripe, pay(2));
    expect((await db.collection('referralCredits').doc('ref').get()).data()?.pendingPlayDays).toBe(30);
    const defer = vi.fn(async () => true);
    await applyPendingPlayDays(db as never, { defer }, 'ref', 'pro');
    await applyPendingPlayDays(db as never, { defer }, 'ref', 'pro');
    expect(defer).toHaveBeenCalledTimes(1);
  });
  it('takes card credit back when the payment is refunded', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({ stripeCustomerId: 'cus_ref' });
    await db.collection('users').doc('new').set({ stripeCustomerId: 'cus_new' });
    await recordReferrer(db as never, 'new', 'ref');
    await grantReferralReward(db as never, stripe, pay(1)); await grantReferralReward(db as never, stripe, pay(2));
    expect(await revokeReferralReward(db as never, stripe, 'cus_new')).toBe(true);
    expect(await revokeReferralReward(db as never, stripe, 'cus_new')).toBe(false);
    expect(calls.mock.calls.slice(2).map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as { amount: number }).amount])).toEqual([['cus_new', 4900], ['cus_ref', 4900]]);
  });
  it('works out one month of a Play payment', () => {
    const d = 86_400_000;
    expect(playMonthlyCents(19.99, 0 + 1, 30 * d + 1)).toBe(1999);
    expect(playMonthlyCents(119.99, 1, 365 * d)).toBe(1000);
    expect(playMonthlyCents(0, 1, 30 * d)).toBeNull();
  });
  it('pays no free months on a member a partner brought in', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({ stripeCustomerId: 'cus_ref' });
    await db.collection('users').doc('new').set({ stripeCustomerId: 'cus_new', attribution: { pendingPartnerId: 'p1', pendingCode: 'MIKE' } });
    await recordReferrer(db as never, 'new', 'ref');
    for (const n of [1, 2, 3]) expect(await grantReferralReward(db as never, stripe, pay(n))).toBe('skipped');
    expect(calls).not.toHaveBeenCalled();
  });
});
