import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

/**
 * Switching a plan on a membership that is already set to cancel.
 *
 * Cancelling sets cancel_at_period_end, which leaves the subscription ACTIVE
 * until the period runs out — so this route's status guard passed, and then
 * Stripe refused to price the change with "No upcoming invoices for customer",
 * because a subscription that is ending has no next invoice. The member saw
 * "Could not change your plan right now" and had no way forward. Someone who
 * cancelled, reconsidered, and chose a plan is someone trying to pay, which
 * makes it the worst possible moment to show a dead end.
 *
 * The tests below pin both halves of the fix and, just as importantly, pin
 * that the ordinary path did not change: no cancel_at_period_end is sent for a
 * member who never cancelled.
 */

let db = makeAdminDb();
let subscription: {
  status: string;
  cancel_at_period_end?: boolean;
  items: { data: Array<{ id: string }> };
  metadata?: Record<string, string>;
};
let previewCalls: Array<Record<string, unknown>> = [];
let updateCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAuthed: async () => ({ uid: 'u1' }) }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));
vi.mock('@/lib/stripeProducts', () => ({
  getOrCreatePlanProduct: async () => 'warfarefitness_plan_p_new',
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    subscriptions: {
      retrieve: async () => subscription,
      update: async (_id: string, params: Record<string, unknown>) => { updateCalls.push(params); return {}; },
    },
    invoices: {
      createPreview: async (params: Record<string, unknown>) => {
        previewCalls.push(params);
        const details = params.subscription_details as { cancel_at_period_end?: boolean } | undefined;
        // What Stripe actually does: a subscription with no future invoice
        // cannot be previewed, unless the preview is told to treat the
        // cancellation as lifted.
        if (subscription.cancel_at_period_end && details?.cancel_at_period_end !== false) {
          throw new Error('No upcoming invoices for customer: cus_test');
        }
        return {
          currency: 'usd',
          period_end: 1800000000,
          lines: { data: [{ proration: true, amount: 500 }] },
        };
      },
    },
  }),
}));

const { POST } = await import('./route');

const call = (body: Record<string, unknown>) => POST(new Request('http://x/api/stripe/change-plan', {
  method: 'POST',
  headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
  body: JSON.stringify(body),
}) as never);

const USER = 'users/u1';

beforeEach(() => {
  db = makeAdminDb();
  previewCalls = [];
  updateCalls = [];
  subscription = { status: 'active', items: { data: [{ id: 'si_1' }] }, metadata: { planId: 'p_old', periodMonths: '1' } };
  db.docs.set(USER, {
    membership: { status: 'active', stripeSubscriptionId: 'sub_1', planId: 'p_old' },
  });
  db.docs.set('config/membershipPlans', {
    plans: [
      { id: 'p_old', name: 'Conquer', priceMonthly: 29.99, currency: 'USD', active: true },
      { id: 'p_new', name: 'Vanguard', priceMonthly: 49.99, currency: 'USD', active: true },
    ],
  });
});

describe('a membership that is not cancelling', () => {
  it('previews without mentioning cancellation at all', async () => {
    const res = await call({ planId: 'p_new', periodMonths: 1, preview: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.resumesSubscription).toBe(false);
    // The ordinary path must be exactly the call it has always been.
    expect(previewCalls[0].subscription_details).not.toHaveProperty('cancel_at_period_end');
  });

  it('commits without touching the cancellation flag', async () => {
    const res = await call({ planId: 'p_new', periodMonths: 1 });
    expect(res.status).toBe(200);
    expect(updateCalls[0]).not.toHaveProperty('cancel_at_period_end');
    expect(db.sub(USER, 'membership')).not.toHaveProperty('cancelAtPeriodEnd');
  });
});

describe('a membership already set to cancel', () => {
  beforeEach(() => {
    subscription.cancel_at_period_end = true;
    db.docs.set(USER, {
      membership: { status: 'active', stripeSubscriptionId: 'sub_1', planId: 'p_old', cancelAtPeriodEnd: true },
    });
  });

  it('prices the switch instead of failing', async () => {
    const res = await call({ planId: 'p_new', periodMonths: 1, preview: true });
    const body = await res.json();

    // Before the fix this was a 500 reading "Could not change your plan".
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.prorationAmount).toBe(5);
  });

  it('tells the client the switch will resume the membership', async () => {
    const res = await call({ planId: 'p_new', periodMonths: 1, preview: true });
    const body = await res.json();
    // The client turns this into a sentence in the confirm dialog, so the
    // member agrees to the billing change rather than discovering it.
    expect(body.resumesSubscription).toBe(true);
  });

  it('lifts the cancellation in the same update as the plan change', async () => {
    const res = await call({ planId: 'p_new', periodMonths: 1 });
    expect(res.status).toBe(200);
    expect(updateCalls[0].cancel_at_period_end).toBe(false);
  });

  it('clears the flag on the profile so it does not still say "ending"', async () => {
    await call({ planId: 'p_new', periodMonths: 1 });
    const m = db.sub(USER, 'membership');
    // The webhook writes this too, but it lands after the app has already
    // re-read the profile.
    expect(m.cancelAtPeriodEnd).toBe(false);
    expect(m.planId).toBe('p_new');
    expect(m.planName).toBe('Vanguard');
  });
});
