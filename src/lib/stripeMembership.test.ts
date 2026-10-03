import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

/**
 * The grant that runs when a member returns from Stripe Checkout, before the
 * webhook has arrived. It must unlock exactly the sessions the webhook would
 * unlock, and never win an argument with a webhook that already knows more.
 */

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__delete__' },
  FieldPath: class { constructor(public path: string) {} },
}));

const { grantFromCheckoutSession, setSubscriptionStatus } = await import('./stripeMembership');

function makeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const make = (path: string) => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(path, { ...(opts?.merge ? docs.get(path) : {}), ...data });
    },
    update: async (...args: unknown[]) => {
      if (!docs.has(path)) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
      const cur = { ...docs.get(path) };
      for (let i = 0; i < args.length; i += 2) delete cur[(args[i] as { path: string }).path];
      docs.set(path, cur);
    },
  });
  return {
    docs,
    collection: (c: string) => ({ doc: (d: string) => make(`${c}/${d}`) }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { set: (d: Record<string, unknown>, o?: { merge?: boolean }) => Promise<void> }, d: Record<string, unknown>, o?: { merge?: boolean }) => { void ref.set(d, o); },
    }),
    membership: () => (docs.get('users/u1')?.membership ?? {}) as Record<string, unknown>,
  };
}

let db = makeDb();
let subStatus = 'active';
const stripe = {
  subscriptions: { retrieve: async () => ({ id: 'sub_1', status: subStatus, current_period_end: 1893456000 }) },
} as unknown as Stripe;

function session(over: Partial<Stripe.Checkout.Session> & { metadata?: Record<string, string> } = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_1', status: 'complete', payment_status: 'paid', created: 1_700_000_000, subscription: 'sub_1',
    metadata: { userId: 'u1', planId: 'p1', planName: 'Monthly', trialUsed: 'true' },
    ...over,
  } as unknown as Stripe.Checkout.Session;
}

beforeEach(() => {
  db = makeDb();
  db.docs.set('users/u1', { email: 'a@b.c' });
  subStatus = 'active';
});

describe('grantFromCheckoutSession', () => {
  it('grants an active membership from a paid, complete session', async () => {
    const ok = await grantFromCheckoutSession(db as never, stripe, session(), 'test');
    expect(ok).toBe(true);
    const m = db.membership();
    expect(m.status).toBe('active');
    expect(m.planId).toBe('p1');
    expect(m.stripeSubscriptionId).toBe('sub_1');
    expect(m.lastEventCreated).toBe(1_700_000_000);
    expect(m.expiresAt).toBeInstanceOf(Date);
    expect(db.docs.get('users/u1')?.trialUsedAt).toBe('__ts__');
  });

  it('grants a trialing subscription even before the first invoice is paid', async () => {
    subStatus = 'trialing';
    const ok = await grantFromCheckoutSession(db as never, stripe, session({ payment_status: 'unpaid' } as never), 'test');
    expect(ok).toBe(true);
    expect(db.membership().status).toBe('active');
  });

  it('grants nothing while the session is open or the subscription incomplete', async () => {
    expect(await grantFromCheckoutSession(db as never, stripe, session({ status: 'open' } as never), 'test')).toBe(false);
    subStatus = 'incomplete';
    expect(await grantFromCheckoutSession(db as never, stripe, session({ payment_status: 'unpaid' } as never), 'test')).toBe(false);
    expect(db.membership().status).toBeUndefined();
  });

  it('ignores one-off program purchases and sessions without a user', async () => {
    expect(await grantFromCheckoutSession(db as never, stripe, session({ metadata: { userId: 'u1', kind: 'program_purchase' } }), 'test')).toBe(false);
    expect(await grantFromCheckoutSession(db as never, stripe, session({ metadata: {} }), 'test')).toBe(false);
    expect(db.membership().status).toBeUndefined();
  });

  it('writes coaching, not membership, when the session says so', async () => {
    await grantFromCheckoutSession(db as never, stripe, session({ metadata: { userId: 'u1', kind: 'coaching', planId: 'c1' } }), 'test');
    expect(db.membership().status).toBeUndefined();
    expect((db.docs.get('users/u1')?.coaching as Record<string, unknown>).status).toBe('active');
  });

  it('never overwrites a newer webhook event, and a later webhook still applies after it', async () => {
    // Webhook already processed a later cancellation.
    await setSubscriptionStatus(db as never, 'u1', 'membership', 'none', undefined, undefined, undefined, undefined, undefined, undefined, 1_700_000_500, 'webhook');
    const late = await grantFromCheckoutSession(db as never, stripe, session(), 'test');
    expect(late).toBe(false);
    expect(db.membership().status).toBe('none');

    // Fresh user: return grant first, then a newer webhook event wins.
    db.docs.set('users/u2', {});
    await grantFromCheckoutSession(db as never, stripe, session({ metadata: { userId: 'u2' } }), 'test');
    const applied = await setSubscriptionStatus(db as never, 'u2', 'membership', 'none', undefined, undefined, undefined, undefined, undefined, undefined, 1_700_000_001, 'webhook');
    expect(applied).toBe(true);
    expect((db.docs.get('users/u2')?.membership as Record<string, unknown>).status).toBe('none');
  });
});
