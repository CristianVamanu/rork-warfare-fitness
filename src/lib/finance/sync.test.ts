import { describe, it, expect } from 'vitest';
import { makeAdminDb } from '@/test/fakeAdminDb';
import { syncFromStripe, loadFinData, mirrorStripeEvent } from './sync';

/** A Stripe list that the SDK's auto-pagination would yield. */
const list = <T,>(items: T[]) => ({ [Symbol.asyncIterator]: async function* () { yield* items; } });

const sub = (price: number) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', created: 100, start_date: 100, current_period_start: 100, current_period_end: 200,
  cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, trial_start: null, trial_end: null,
  items: { data: [{ quantity: 1, price: { id: 'price_1', product: 'prod_1', nickname: null, unit_amount: price, currency: 'gbp', recurring: { interval: 'month', interval_count: 1 } } }] },
  metadata: { userId: 'u1', planName: 'Monthly' }, discount: null, cancellation_details: null, pause_collection: null,
});
const fakeStripe = () => ({
  customers: { list: () => list([{ id: 'cus_1', email: 'a@x.com', name: 'A', address: { country: 'GB' }, metadata: { userId: 'u1' }, created: 50 }]) },
  subscriptions: { list: () => list([sub(1000)]) },
  charges: { list: () => list([{ id: 'ch_1', customer: 'cus_1', invoice: 'in_1', payment_intent: 'pi_1', amount: 1000, amount_refunded: 0, currency: 'gbp', status: 'succeeded', refunded: false, disputed: false, created: 150, metadata: {}, payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242', country: 'GB' } }, balance_transaction: { fee: 35, currency: 'gbp' }, outcome: null }]) },
  invoices: { list: () => list([{ id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'paid', billing_reason: 'subscription_create', currency: 'gbp', amount_due: 1000, amount_paid: 1000, amount_remaining: 0, total: 1000, attempt_count: 1, created: 150, status_transitions: { paid_at: 150 }, lines: { data: [] } }]) },
  refunds: { list: () => list([]) },
  disputes: { list: () => list([]) },
});

describe('financial mirror sync', () => {
  it('a second sync overwrites rather than duplicates', async () => {
    const db = makeAdminDb();
    await syncFromStripe(db as never, fakeStripe() as never, { full: true });
    await syncFromStripe(db as never, fakeStripe() as never);
    const { data, meta } = await loadFinData(db as never);
    expect(data.charges).toHaveLength(1);
    expect(data.subscriptions).toHaveLength(1);
    expect(data.invoices).toHaveLength(1);
    expect(data.charges[0]).toMatchObject({ amount: 1000, feeAmount: 35, pmBrand: 'visa', pmLast4: '4242' });
    expect(JSON.stringify(data.charges[0])).not.toMatch(/fingerprint|exp_month|cvc/);
    expect(meta.lastFullSyncAt).toBeTruthy();
  });
  it('a webhook price change records expansion and updates the subscription', async () => {
    const db = makeAdminDb();
    await mirrorStripeEvent(db as never, {
      id: 'evt_1', type: 'customer.subscription.updated', created: 300,
      data: { object: sub(2000), previous_attributes: { items: { data: [{ quantity: 1, price: { id: 'price_0', unit_amount: 1000, currency: 'gbp', recurring: { interval: 'month', interval_count: 1 } } }] } } },
    } as never);
    const { data } = await loadFinData(db as never);
    expect(data.subChanges).toEqual([expect.objectContaining({ subscription: 'sub_1', fromMonthly: 1000, toMonthly: 2000 })]);
    expect(data.subscriptions[0].items[0].unitAmount).toBe(2000);
  });
});
