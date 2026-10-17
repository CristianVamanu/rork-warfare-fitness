import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

/**
 * Resuming a period-end cancellation.
 *
 * Cancel leaves the Stripe subscription live with cancel_at_period_end set,
 * so the undo is a single flag flip and nothing else: no new checkout, no
 * new trial. The tests pin that the flag is cleared on Stripe AND in the
 * user document, that an already-ended subscription is refused with a clear
 * code, and that a subscription nobody cancelled is a harmless no-op that
 * still repairs a stale cancelAtPeriodEnd in Firestore.
 */

let db = makeAdminDb();
let subscription: { status: string; cancel_at_period_end?: boolean };
let updateCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAuthedNotTfaPending: async () => ({ uid: 'u1' }) }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    subscriptions: {
      retrieve: async () => subscription,
      update: async (_id: string, params: Record<string, unknown>) => { updateCalls.push(params); return {}; },
    },
  }),
}));

const { POST } = await import('./route');

const call = (body: Record<string, unknown>) => POST(new Request('http://x/api/stripe/resume-subscription', {
  method: 'POST',
  headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
  body: JSON.stringify(body),
}) as never);

const USER = 'users/u1';

beforeEach(() => {
  db = makeAdminDb();
  updateCalls = [];
  subscription = { status: 'active', cancel_at_period_end: true };
  db.docs.set(USER, {
    membership: { status: 'active', stripeSubscriptionId: 'sub_1', planId: 'p_1', cancelAtPeriodEnd: true },
    coaching: { status: 'active', stripeSubscriptionId: 'sub_c', planId: 'c_1', cancelAtPeriodEnd: true },
  });
});

describe('POST /api/stripe/resume-subscription', () => {
  it('clears cancel_at_period_end on Stripe and in the user doc', async () => {
    const res = await call({ kind: 'membership' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateCalls).toEqual([{ cancel_at_period_end: false }]);
    expect((db.docs.get(USER) as { membership: { cancelAtPeriodEnd: boolean } }).membership.cancelAtPeriodEnd).toBe(false);
  });

  it('resumes coaching without touching membership', async () => {
    const res = await call({ kind: 'coaching' });
    expect(res.status).toBe(200);
    const doc = db.docs.get(USER) as { membership: { cancelAtPeriodEnd: boolean }; coaching: { cancelAtPeriodEnd: boolean } };
    expect(doc.coaching.cancelAtPeriodEnd).toBe(false);
    expect(doc.membership.cancelAtPeriodEnd).toBe(true);
  });

  it('refuses once the subscription has actually ended', async () => {
    subscription = { status: 'canceled', cancel_at_period_end: false };
    const res = await call({ kind: 'membership' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ENDED');
    expect(updateCalls).toEqual([]);
  });

  it('is a no-op that repairs a stale flag when nothing was cancelled', async () => {
    subscription = { status: 'active', cancel_at_period_end: false };
    const res = await call({ kind: 'membership' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyActive: true });
    expect(updateCalls).toEqual([]);
    expect((db.docs.get(USER) as { membership: { cancelAtPeriodEnd: boolean } }).membership.cancelAtPeriodEnd).toBe(false);
  });

  it('400s when there is no subscription to resume', async () => {
    db.docs.set(USER, { membership: { status: 'none' } });
    const res = await call({ kind: 'membership' });
    expect(res.status).toBe(400);
  });
});
