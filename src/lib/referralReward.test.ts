import { describe, it, expect, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));

import { monthlyCents, recordReferrer, grantReferralReward, applyPendingReferralCredit } from './referralReward';

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
  it('credits both sides once, on the first real payment only', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({ stripeCustomerId: 'cus_ref' });
    await recordReferrer(db as never, 'new', 'ref');
    const args = { memberUid: 'new', memberCustomerId: 'cus_new', amountPaidCents: 4900, currency: 'usd', price: monthly };
    expect(await grantReferralReward(db as never, stripe, { ...args, amountPaidCents: 0 })).toBe('skipped');
    expect(await grantReferralReward(db as never, stripe, args)).toBe('granted');
    expect(await grantReferralReward(db as never, stripe, args)).toBe('skipped');
    expect(calls.mock.calls.map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as { amount: number }).amount])).toEqual([['cus_new', -4900], ['cus_ref', -4900]]);
  });
  it('does nothing without a referrer, and the first referrer wins', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    expect(await grantReferralReward(db as never, stripe, { memberUid: 'solo', memberCustomerId: 'cus_s', amountPaidCents: 4900, currency: 'usd', price: monthly })).toBe('skipped');
    await recordReferrer(db as never, 'm', 'a'); await recordReferrer(db as never, 'm', 'b'); await recordReferrer(db as never, 'm', 'm');
    expect((await db.collection('referredBy').doc('m').get()).data()?.referrerUid).toBe('a');
    expect(calls).not.toHaveBeenCalled();
  });
  it('parks the credit for a referrer with no card yet and applies it once later', async () => {
    const db = makeAdminDb(); const { stripe, calls } = fakeStripe();
    await db.collection('users').doc('ref').set({});
    await recordReferrer(db as never, 'new', 'ref');
    await grantReferralReward(db as never, stripe, { memberUid: 'new', memberCustomerId: 'cus_new', amountPaidCents: 4900, currency: 'usd', price: monthly });
    expect(calls).toHaveBeenCalledTimes(1);
    expect((await db.collection('referralCredits').doc('ref').get()).data()?.pendingCents).toBe(4900);
    await applyPendingReferralCredit(db as never, stripe, 'ref', 'cus_ref');
    await applyPendingReferralCredit(db as never, stripe, 'ref', 'cus_ref');
    expect(calls).toHaveBeenCalledTimes(2);
    expect((await db.collection('referralCredits').doc('ref').get()).data()?.pendingCents).toBe(0);
  });
});
