import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

/**
 * Reconciliation is the ONLY correction loop for a lost webhook. It ran
 * nightly for its whole life without a single write landing, because every
 * corrective write used set({'membership.status': …}, {merge:true}) — which
 * creates a top-level field literally named "membership.status" and leaves
 * the real map untouched. These tests read the resolved document the way
 * Firestore stores it, so that shape fails here.
 */

let db = makeAdminDb();
let subs: Record<string, { status: string; current_period_end?: number; cancel_at_period_end?: boolean } | 'missing' | 'error'>;
let adminOk = true;

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAdmin: async () => (adminOk ? { uid: 'admin' } : { error: 'nope', status: 401 }) }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    subscriptions: {
      retrieve: async (id: string) => {
        const s = subs[id];
        if (s === 'error') { const e = new Error('Stripe is down') as Error & { code?: string }; e.code = 'api_error'; throw e; }
        if (!s || s === 'missing') { const e = new Error('No such subscription') as Error & { code?: string }; e.code = 'resource_missing'; throw e; }
        return { id, ...s };
      },
    },
  }),
}));

const { POST } = await import('./route');
const run = (dry = false) => POST(new Request(`http://x/api/admin/reconcile-subscriptions${dry ? '?dryRun=1' : ''}`, {
  method: 'POST', headers: { authorization: 'Bearer cron' },
}) as never);

const USER = 'users/u1';
const inADay = Math.floor(Date.now() / 1000) + 86400;

beforeEach(() => {
  db = makeAdminDb();
  subs = {};
  process.env.CRON_SECRET = 'cron';
});

describe('reconcile-subscriptions — corrections actually land', () => {
  it('revokes when Stripe says the subscription is canceled', async () => {
    db.docs.set(USER, { membership: { status: 'active', stripeSubscriptionId: 'sub_1', planId: 'p' } });
    subs.sub_1 = { status: 'canceled' };
    const res = await run();
    expect(res.status).toBe(200);
    expect(db.sub(USER, 'membership').status).toBe('none');
    expect(db.sub(USER, 'membership').planId).toBe('p');          // untouched
    expect(db.docs.get(USER)!['membership.status']).toBeUndefined(); // no literal dotted field
  });

  it('revokes when the subscription no longer exists in Stripe', async () => {
    db.docs.set(USER, { membership: { status: 'active', stripeSubscriptionId: 'sub_gone' } });
    subs.sub_gone = 'missing';
    await run();
    expect(db.sub(USER, 'membership').status).toBe('none');
  });

  it('refreshes a stale period end for a live subscription', async () => {
    db.docs.set(USER, { membership: { status: 'active', stripeSubscriptionId: 'sub_1' } });
    subs.sub_1 = { status: 'active', current_period_end: inADay, cancel_at_period_end: true };
    await run();
    const m = db.sub(USER, 'membership');
    expect(m.status).toBe('active');
    expect(m.cancelAtPeriodEnd).toBe(true);
    expect(new Date(m.expiresAt as string | Date).getTime()).toBe(inADay * 1000);
  });

  it('touches nothing in dryRun', async () => {
    db.docs.set(USER, { membership: { status: 'active', stripeSubscriptionId: 'sub_1' } });
    subs.sub_1 = { status: 'canceled' };
    const body = await (await run(true)).json();
    expect(body.corrections).toHaveLength(1);
    expect(db.sub(USER, 'membership').status).toBe('active');
  });

  it('leaves a record alone on a transient Stripe error — never revokes on an outage', async () => {
    db.docs.set(USER, { membership: { status: 'active', stripeSubscriptionId: 'sub_1' } });
    subs.sub_1 = 'error';
    await run();
    expect(db.sub(USER, 'membership').status).toBe('active');
  });

  it('handles coaching independently of membership', async () => {
    db.docs.set(USER, {
      membership: { status: 'active', stripeSubscriptionId: 'sub_m' },
      coaching: { status: 'active', stripeSubscriptionId: 'sub_c' },
    });
    subs.sub_m = { status: 'active', current_period_end: inADay };
    subs.sub_c = { status: 'unpaid' };
    await run();
    expect(db.sub(USER, 'membership').status).toBe('active');
    expect(db.sub(USER, 'coaching').status).toBe('none');
  });

  it('rejects a caller with neither the cron secret nor an admin token', async () => {
    adminOk = false;
    try {
      const res = await POST(new Request('http://x/api/admin/reconcile-subscriptions', { method: 'POST', headers: { authorization: 'Bearer wrong' } }) as never);
      expect(res.status).toBe(401);
    } finally {
      adminOk = true;
    }
  });
});
