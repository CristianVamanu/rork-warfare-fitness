import { describe, it, expect } from 'vitest';
import type { FinCharge, FinData, FinInvoice, FinRefund, FinSubscription } from './types';
import { bucketKey, churnBetween, customerRows, forecast, kpis, ledger, mrrAt, periodTotals, recovery, revenueSeries, subMonthlyAt, subStatus } from './metrics';
import { monthlyOfItem } from './normalize';
import { formatMoney, toMinor } from './money';
import { storeEventFrom } from './sync';

const D = 86_400;
const NOW = Date.UTC(2026, 5, 15, 12) / 1000; // 15 Jun 2026 12:00 UTC

function sub(p: Partial<FinSubscription> & { id: string; customer: string }): FinSubscription {
  return {
    uid: null, status: 'active', created: NOW - 200 * D, startDate: NOW - 200 * D, currentPeriodStart: NOW - 10 * D, currentPeriodEnd: NOW + 20 * D,
    cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null, endedAt: null, trialStart: null, trialEnd: null,
    items: [{ priceId: 'price_m', productId: 'prod', nickname: null, unitAmount: 1000, currency: 'gbp', interval: 'month', intervalCount: 1, quantity: 1 }],
    discount: null, planId: null, planName: 'Monthly', field: 'membership', cancelReason: null, paused: false, ...p,
  };
}
function charge(p: Partial<FinCharge> & { id: string }): FinCharge {
  return {
    customer: 'cus_a', invoice: null, paymentIntent: null, amount: 1000, amountRefunded: 0, currency: 'gbp', status: 'succeeded', refunded: false, disputed: false,
    created: NOW - D, description: null, failureCode: null, failureMessage: null, outcomeReason: null, pmType: 'card', pmBrand: 'visa', pmLast4: '4242',
    country: 'GB', receiptNumber: null, feeAmount: 35, feeCurrency: 'gbp', meta: { userId: null, programId: null, kind: null }, ...p,
  };
}
function inv(p: Partial<FinInvoice> & { id: string }): FinInvoice {
  return {
    number: null, customer: 'cus_a', subscription: 'sub_a', status: 'paid', billingReason: 'subscription_cycle', currency: 'gbp', amountDue: 1000, amountPaid: 1000,
    amountRemaining: 0, total: 1000, tax: 0, discountTotal: 0, attemptCount: 1, nextPaymentAttempt: null, created: NOW - D, paidAt: NOW - D, charge: null, priceIds: [], ...p,
  };
}
const empty = (): FinData => ({ customers: [], subscriptions: [], invoices: [], charges: [], refunds: [], disputes: [], subChanges: [], storeEvents: [] });
const ctx = (data: FinData, cur = 'gbp') => ({ data, cur, now: NOW, tz: 'UTC' });

describe('money', () => {
  it('keeps integer minor units and formats per currency', () => {
    expect(toMinor(9.99, 'gbp')).toBe(999);
    expect(toMinor(1200, 'jpy')).toBe(1200);
    expect(formatMoney(123456, 'gbp')).toBe('£1,234.56');
    expect(formatMoney(500, 'jpy')).toBe('JP¥500');
  });
});

describe('normalisation of intervals', () => {
  it('normalises yearly, weekly and multi-month prices to monthly', () => {
    expect(monthlyOfItem({ priceId: 'p', productId: null, nickname: null, unitAmount: 12000, currency: 'gbp', interval: 'year', intervalCount: 1, quantity: 1 })).toBe(1000);
    expect(monthlyOfItem({ priceId: 'p', productId: null, nickname: null, unitAmount: 3000, currency: 'gbp', interval: 'month', intervalCount: 3, quantity: 1 })).toBe(1000);
    expect(Math.round(monthlyOfItem({ priceId: 'p', productId: null, nickname: null, unitAmount: 1000, currency: 'gbp', interval: 'week', intervalCount: 1, quantity: 1 }))).toBe(4348);
  });
});

describe('MRR', () => {
  it('counts active and past_due, excludes trials, cancelled and other currencies, applies discounts', () => {
    const d = empty();
    d.subscriptions = [
      sub({ id: 's1', customer: 'a' }),
      sub({ id: 's2', customer: 'b', status: 'past_due' }),
      sub({ id: 's3', customer: 'c', status: 'trialing', trialEnd: NOW + 5 * D }),
      sub({ id: 's4', customer: 'd', status: 'canceled', endedAt: NOW - 3 * D }),
      sub({ id: 's5', customer: 'e', items: [{ priceId: 'u', productId: null, nickname: null, unitAmount: 999, currency: 'usd', interval: 'month', intervalCount: 1, quantity: 1 }] }),
      sub({ id: 's6', customer: 'f', discount: { percentOff: 50, amountOff: null, currency: null, duration: 'forever', end: null } }),
    ];
    const m = mrrAt(ctx(d), NOW);
    expect(m.mrr).toBe(1000 + 1000 + 500);
    expect(m.customers.size).toBe(3);
    expect(mrrAt(ctx(d, 'usd'), NOW).mrr).toBe(999);
  });
  it('a scheduled cancellation still counts until the period actually ends, and is not churn', () => {
    const d = empty();
    d.subscriptions = [sub({ id: 's1', customer: 'a', cancelAtPeriodEnd: true })];
    expect(mrrAt(ctx(d), NOW).mrr).toBe(1000);
    const c = churnBetween(ctx(d), NOW - 30 * D, NOW);
    expect(c.lost).toBe(0);
    expect(subStatus(d.subscriptions[0])).toBe('cancelling');
  });
  it('churn counts a customer whose subscription ended inside the period', () => {
    const d = empty();
    d.subscriptions = [sub({ id: 's1', customer: 'a' }), sub({ id: 's2', customer: 'b', status: 'canceled', endedAt: NOW - 5 * D, canceledAt: NOW - 5 * D })];
    const c = churnBetween(ctx(d), NOW - 30 * D, NOW);
    expect(c.startCustomers).toBe(2);
    expect(c.lost).toBe(1);
    expect(c.rate).toBe(0.5);
    expect(c.churnedMrr).toBe(1000);
  });
  it('replays a recorded price change so past MRR uses the old price', () => {
    const s = sub({ id: 's1', customer: 'a', items: [{ priceId: 'p2', productId: null, nickname: null, unitAmount: 2000, currency: 'gbp', interval: 'month', intervalCount: 1, quantity: 1 }] });
    const changes = [{ id: 'evt', subscription: 's1', customer: 'a', at: NOW - 10 * D, fromMonthly: 1000, toMonthly: 2000, currency: 'gbp' }];
    expect(subMonthlyAt(s, NOW - 20 * D, changes)).toBe(1000);
    expect(subMonthlyAt(s, NOW, changes)).toBe(2000);
  });
});

describe('revenue', () => {
  it('nets refunds and lost disputes, never mixes currencies, ignores failed charges', () => {
    const d = empty();
    d.charges = [charge({ id: 'c1' }), charge({ id: 'c2', amount: 2000 }), charge({ id: 'c3', status: 'failed' }), charge({ id: 'c4', currency: 'usd', amount: 5000 })];
    d.refunds = [{ id: 'r1', charge: 'c2', amount: 500, currency: 'gbp', status: 'succeeded', reason: null, created: NOW - D / 2 } as FinRefund,
      { id: 'r2', charge: 'c2', amount: 100, currency: 'gbp', status: 'pending', reason: null, created: NOW - D / 2 } as FinRefund];
    d.disputes = [{ id: 'dp', charge: 'c1', amount: 1000, currency: 'gbp', status: 'lost', reason: 'fraudulent', created: NOW - D / 2 }];
    const t = periodTotals(ctx(d), NOW - 7 * D, NOW + 1);
    expect(t.gross).toBe(3000);
    expect(t.refunds).toBe(500);
    expect(t.refundsPending).toBe(100);
    expect(t.net).toBe(3000 - 500 - 1000);
    expect(t.fees).toBe(70);
    expect(periodTotals(ctx(d, 'usd'), NOW - 7 * D, NOW + 1).gross).toBe(5000);
  });
  it('the same charge mirrored twice is one record (keyed by id), so it counts once', () => {
    const d = empty();
    const m = new Map([charge({ id: 'c1' }), charge({ id: 'c1' })].map((c) => [c.id, c]));
    d.charges = [...m.values()];
    expect(periodTotals(ctx(d), NOW - 7 * D, NOW + 1).gross).toBe(1000);
  });
  it('compares against the previous equivalent period', () => {
    const d = empty();
    d.charges = [charge({ id: 'now', created: NOW - 2 * D, amount: 3000 }), charge({ id: 'before', created: NOW - 9 * D, amount: 1000 })];
    const k = kpis(ctx(d), NOW - 7 * D, NOW);
    expect(k.revenue.gross).toBe(3000);
    expect(k.revenue.prevGross).toBe(1000);
  });
  it('buckets by the admin timezone', () => {
    const t = Date.UTC(2026, 0, 1, 23, 30) / 1000; // 23:30 UTC on 1 Jan
    expect(bucketKey(t, 'day', 'UTC')).toBe('2026-01-01');
    expect(bucketKey(t, 'day', 'Asia/Tokyo')).toBe('2026-01-02');
    expect(bucketKey(Date.UTC(2026, 0, 7) / 1000, 'week', 'UTC')).toBe('2026-01-05'); // Wednesday -> Monday
  });
  it('revenue series sums to the period totals', () => {
    const d = empty();
    d.charges = [charge({ id: 'a', created: NOW - 3 * D }), charge({ id: 'b', created: NOW - 1 * D, amount: 2500 })];
    const s = revenueSeries(ctx(d), NOW - 7 * D, NOW, 'day');
    expect(s.reduce((a, r) => a + r.gross, 0)).toBe(3500);
  });
});

describe('failed payments and recovery', () => {
  it('separates outstanding, recovered and lost', () => {
    const d = empty();
    d.charges = [charge({ id: 'f1', status: 'failed', amount: 1000 })];
    d.invoices = [
      inv({ id: 'open', status: 'open', amountRemaining: 1000, amountPaid: 0, attemptCount: 2, nextPaymentAttempt: NOW + D, paidAt: null }),
      inv({ id: 'rec', status: 'paid', attemptCount: 3, paidAt: NOW - D }),
    ];
    const r = recovery(ctx(d), NOW - 30 * D, NOW + 1);
    expect(r.failedCount).toBe(1);
    expect(r.outstanding).toBe(1000);
    expect(r.awaitingRetry).toBe(1);
    expect(r.recoveredAmount).toBe(1000);
    expect(r.rate).toBe(0.5);
  });
});

describe('customers and ledger', () => {
  it('one row per paying customer with totals net of refunds and the next billing date', () => {
    const d = empty();
    d.customers = [{ id: 'cus_a', email: 'a@x.com', name: 'Alex', country: 'GB', uid: 'u1', created: NOW - 300 * D }];
    d.subscriptions = [sub({ id: 'sub_a', customer: 'cus_a' })];
    d.charges = [charge({ id: 'c1', invoice: 'i1' }), charge({ id: 'c2', invoice: 'i2' }), charge({ id: 'c3', status: 'failed' })];
    d.invoices = [inv({ id: 'i1', billingReason: 'subscription_create' }), inv({ id: 'i2' })];
    d.refunds = [{ id: 'r1', charge: 'c2', amount: 400, currency: 'gbp', status: 'succeeded', reason: 'requested_by_customer', created: NOW } as FinRefund];
    const [row] = customerRows(d);
    expect(row.totalPaid).toBe(2000);
    expect(row.refunded).toBe(400);
    expect(row.ltv).toBe(1600);
    expect(row.payments).toBe(2);
    expect(row.failed).toBe(1);
    expect(row.nextBilling).toBe(NOW + 20 * D);
    expect(row.pm).toBe('visa •••• 4242');
    const l = ledger(d);
    expect(l.find((x) => x.id === 'c1')?.type).toBe('initial');
    expect(l.find((x) => x.id === 'c2')?.type).toBe('renewal');
    expect(l.find((x) => x.id === 'r1')?.amount).toBe(-400);
  });
});

describe('forecast', () => {
  it('never assumes every subscription renews and skips scheduled cancellations', () => {
    const d = empty();
    d.subscriptions = [sub({ id: 's1', customer: 'a' }), sub({ id: 's2', customer: 'b', cancelAtPeriodEnd: true })];
    const f = forecast(ctx(d));
    expect(f.revenue.expected.d30).toBeGreaterThan(0);
    expect(f.revenue.expected.d30).toBeLessThan(1000);
    expect(f.revenue.optimistic.m12).toBeGreaterThan(f.revenue.expected.m12);
    expect(f.revenue.expected.m12).toBeGreaterThan(f.revenue.conservative.m12);
    expect(f.assumptions.churnObserved).toBe(false);
  });
});

describe('Google Play ledger', () => {
  it('records price in minor units for purchases, none for cancellations', () => {
    expect(storeEventFrom({ id: 'e1', type: 'RENEWAL', app_user_id: 'u1', price_in_purchased_currency: 4.99, currency: 'GBP', event_timestamp_ms: NOW * 1000 })?.amount).toBe(499);
    expect(storeEventFrom({ id: 'e2', type: 'CANCELLATION', app_user_id: 'u1', price_in_purchased_currency: 4.99, currency: 'GBP' })?.amount).toBeNull();
    expect(storeEventFrom({ id: 'e3', type: 'TEST' })).toBeNull();
  });
});
