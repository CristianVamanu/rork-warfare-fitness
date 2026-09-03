import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Behavioural tests for the Stripe webhook — the single most consequential
 * file in the app, and until now the least covered.
 *
 * Everything the handler touches is mocked: Stripe, the Admin SDK, and the
 * outbound mailer. What is under test is the decision logic — who gets
 * access, who loses it, what is idempotent, and what returns 500 so Stripe
 * retries. Those rules were only ever documented in comments, so a
 * regression in any of them was silent.
 */

// ── Fakes ───────────────────────────────────────────────────────────────────

interface Write { path: string; data: Record<string, unknown>; merge: boolean }

/** Minimal in-memory stand-in for the Admin Firestore surface this route uses. */
function makeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: Write[] = [];
  const make = (path: string) => ({
    get: async () => ({
      exists: docs.has(path),
      data: () => docs.get(path),
    }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      writes.push({ path, data, merge: !!opts?.merge });
      docs.set(path, { ...(opts?.merge ? docs.get(path) : {}), ...data });
    },
    update: async (data: Record<string, unknown>) => {
      if (!docs.has(path)) { const e = new Error('NOT_FOUND'); (e as { code?: number }).code = 5; throw e; }
      writes.push({ path, data, merge: true });
      docs.set(path, { ...docs.get(path), ...data });
    },
  });
  return {
    docs, writes,
    collection: (c: string) => ({ doc: (d: string) => make(`${c}/${d}`) }),
    /** Every field written to any doc under this path, flattened. */
    written: (path: string) => Object.assign({}, ...writes.filter((w) => w.path === path).map((w) => w.data)),
    wroteTo: (path: string) => writes.some((w) => w.path === path),
  };
}

let db = makeDb();
let stripe: Record<string, unknown>;
let constructEventImpl: (body: string, sig: string, secret: string) => unknown;
const sentEmails: { to: string; subject: string }[] = [];

vi.mock('@/lib/firebase-admin', () => ({
  getAdminApp: () => ({}),
  getAdminDb: () => db,
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => stripe,
  getStripeWebhookSecret: async () => 'whsec_test',
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: { to: string; subject: string }) => { sentEmails.push(m); },
  paymentFailedEmailHtml: () => '<p/>',
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__ts__',
    arrayUnion: (...v: unknown[]) => ({ __arrayUnion: v }),
    arrayRemove: (...v: unknown[]) => ({ __arrayRemove: v }),
  },
}));

// Imported after the mocks are registered.
const { POST } = await import('./route');

function rawReq() {
  return new Request('https://x/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  }) as unknown as Parameters<typeof POST>[0];
}

function req(event: unknown) {
  constructEventImpl = () => event;
  return rawReq();
}

const USER = 'users/u1';

beforeEach(() => {
  db = makeDb();
  db.docs.set(USER, { email: 'a@b.c', displayName: 'Ann' });
  sentEmails.length = 0;
  stripe = {
    webhooks: { constructEvent: (b: string, s: string, k: string) => constructEventImpl(b, s, k) },
    subscriptions: {
      retrieve: async () => ({ id: 'sub_1', status: 'active', current_period_end: 1893456000, metadata: { userId: 'u1' } }),
      cancel: async () => ({ status: 'canceled' }),
      list: async () => ({ data: [] }),
    },
    charges: { retrieve: async () => ({ id: 'ch_1', refunded: true, payment_intent: null, metadata: {}, customer: null }) },
    paymentIntents: { retrieve: async () => ({ metadata: {} }) },
    invoices: { list: async () => ({ data: [] }) },
  };
});

// ── Signature ───────────────────────────────────────────────────────────────

describe('signature verification', () => {
  it('rejects an unverifiable payload with 400 and touches nothing', async () => {
    constructEventImpl = () => { throw new Error('bad sig'); };
    // rawReq, not req() — req() installs its own constructEvent stub and
    // would overwrite the throwing one this test is about.
    const res = await POST(rawReq());
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });
});

// ── Granting access ─────────────────────────────────────────────────────────

describe('checkout.session.completed', () => {
  const session = (over: Record<string, unknown> = {}) => ({
    id: 'evt_1', type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', metadata: { userId: 'u1', kind: 'membership', planId: 'p1', planName: 'Pro' }, ...over } },
  });

  it('grants membership when the payment is paid', async () => {
    const res = await POST(req(session()));
    expect(res.status).toBe(200);
    expect(db.written(USER)['membership.status']).toBe('active');
    expect(db.written(USER)['membership.planId']).toBe('p1');
  });

  it('does NOT grant when payment is unpaid and the subscription is incomplete', async () => {
    (stripe.subscriptions as { retrieve: unknown }).retrieve = async () => ({ id: 'sub_1', status: 'incomplete', metadata: { userId: 'u1' } });
    await POST(req(session({ payment_status: 'unpaid' })));
    expect(db.wroteTo(USER)).toBe(false);
  });

  it('grants a no-payment-required free trial once Stripe says trialing', async () => {
    (stripe.subscriptions as { retrieve: unknown }).retrieve = async () => ({ id: 'sub_1', status: 'trialing', current_period_end: 1893456000, metadata: { userId: 'u1' } });
    await POST(req(session({ payment_status: 'no_payment_required' })));
    expect(db.written(USER)['membership.status']).toBe('active');
  });

  it('writes trialUsedAt in the SAME write as the grant when a trial was used', async () => {
    await POST(req(session({ metadata: { userId: 'u1', kind: 'membership', trialUsed: 'true' } })));
    // One atomic write, not a second fire-and-forget one — a separate write
    // could fail silently and leave trial farming wide open.
    const grant = db.writes.find((w) => w.path === USER && w.data['membership.status'] === 'active');
    expect(grant).toBeDefined();
    expect(grant!.data.trialUsedAt).toBe('__ts__');
  });

  it('does not mark trialUsedAt when no trial was involved', async () => {
    await POST(req(session()));
    expect(db.written(USER).trialUsedAt).toBeUndefined();
  });

  it('records a one-time program purchase', async () => {
    await POST(req({
      id: 'evt_p', type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { userId: 'u1', kind: 'program_purchase', programId: 'prog9' } } },
    }));
    expect(db.written(USER).purchasedProgramIds).toEqual({ __arrayUnion: ['prog9'] });
  });

  it('survives a deleted user doc instead of throwing NOT_FOUND', async () => {
    db.docs.delete(USER); // account deleted while the subscription was live
    const res = await POST(req(session()));
    expect(res.status).toBe(200);
  });
});

// ── Subscription lifecycle ──────────────────────────────────────────────────

describe('customer.subscription.updated', () => {
  const evt = (status: string, over: Record<string, unknown> = {}) => ({
    id: `evt_${status}`, type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status, current_period_end: 1893456000, metadata: { userId: 'u1', kind: 'membership' }, ...over } },
  });

  it.each(['active', 'trialing', 'past_due'])('keeps access for status "%s"', async (status) => {
    await POST(req(evt(status)));
    expect(db.written(USER)['membership.status']).toBe('active');
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired'])('revokes access for status "%s"', async (status) => {
    await POST(req(evt(status)));
    expect(db.written(USER)['membership.status']).toBe('none');
  });

  it('records the period end so a stale active can expire on its own', async () => {
    await POST(req(evt('active')));
    expect(db.written(USER)['membership.expiresAt']).toBeInstanceOf(Date);
  });

  it('carries cancel_at_period_end through', async () => {
    await POST(req(evt('active', { cancel_at_period_end: true })));
    expect(db.written(USER)['membership.cancelAtPeriodEnd']).toBe(true);
  });

  it('routes coaching to its own field, never membership', async () => {
    await POST(req({
      id: 'evt_c', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_2', status: 'active', metadata: { userId: 'u1', kind: 'coaching' } } },
    }));
    expect(db.written(USER)['coaching.status']).toBe('active');
    expect(db.written(USER)['membership.status']).toBeUndefined();
  });
});

describe('customer.subscription.deleted', () => {
  it('revokes access', async () => {
    await POST(req({
      id: 'evt_d', type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { userId: 'u1', kind: 'membership' } } },
    }));
    expect(db.written(USER)['membership.status']).toBe('none');
  });
});

// ── Refunds and disputes ────────────────────────────────────────────────────

describe('charge.refunded', () => {
  const evt = { id: 'evt_r', type: 'charge.refunded', data: { object: { id: 'ch_1' } } };

  it('leaves a PARTIAL refund alone — a goodwill credit must not kill a paying member', async () => {
    (stripe.charges as { retrieve: unknown }).retrieve = async () => ({ id: 'ch_1', refunded: false, payment_intent: null, metadata: {}, customer: null });
    await POST(req(evt));
    expect(db.wroteTo(USER)).toBe(false);
  });

  it('revokes on a FULL refund and cancels the subscription at Stripe', async () => {
    const cancel = vi.fn(async () => ({ status: 'canceled' }));
    (stripe.subscriptions as { cancel: unknown }).cancel = cancel;
    (stripe.charges as { retrieve: unknown }).retrieve = async () => ({
      id: 'ch_1', refunded: true, payment_intent: null, metadata: {},
      customer: 'cus_1', invoice: { subscription: 'sub_1' },
    });
    await POST(req(evt));
    expect(db.written(USER)['membership.status']).toBe('none');
    expect(cancel).toHaveBeenCalledWith('sub_1');
  });

  it('revokes a refunded one-time program purchase', async () => {
    (stripe.charges as { retrieve: unknown }).retrieve = async () => ({
      id: 'ch_1', refunded: true, payment_intent: 'pi_1', metadata: {}, customer: null,
    });
    (stripe.paymentIntents as { retrieve: unknown }).retrieve = async () => ({
      metadata: { kind: 'program_purchase', userId: 'u1', programId: 'prog9' },
    });
    await POST(req(evt));
    expect(db.written(USER).purchasedProgramIds).toEqual({ __arrayRemove: ['prog9'] });
  });

  it('refuses to guess when a customer has several live subscriptions and none match', async () => {
    (stripe.charges as { retrieve: unknown }).retrieve = async () => ({ id: 'ch_1', refunded: true, payment_intent: null, metadata: {}, customer: 'cus_1' });
    (stripe.subscriptions as { list: unknown }).list = async () => ({
      data: [{ id: 'sub_a', status: 'active' }, { id: 'sub_b', status: 'active' }],
    });
    await POST(req(evt));
    // Cancelling the wrong one is worse than leaving it for manual review.
    expect(db.wroteTo(USER)).toBe(false);
  });

  it('treats a dispute as full severity even when the charge is not fully refunded', async () => {
    (stripe.charges as { retrieve: unknown }).retrieve = async () => ({
      id: 'ch_1', refunded: false, payment_intent: null, metadata: {},
      customer: 'cus_1', invoice: { subscription: 'sub_1' },
    });
    await POST(req({ id: 'evt_disp', type: 'charge.dispute.created', data: { object: { charge: 'ch_1' } } }));
    expect(db.written(USER)['membership.status']).toBe('none');
  });
});

// ── Failed payment ──────────────────────────────────────────────────────────

describe('invoice.payment_failed', () => {
  const evt = { id: 'evt_f', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } };

  it('emails the customer but does NOT revoke — Stripe is still retrying', async () => {
    (stripe.subscriptions as { retrieve: unknown }).retrieve = async () => ({ id: 'sub_1', status: 'past_due', metadata: { userId: 'u1' } });
    await POST(req(evt));
    expect(sentEmails).toHaveLength(1);
    expect(db.wroteTo(USER)).toBe(false);
  });
});

// ── Idempotency and retries ─────────────────────────────────────────────────

describe('delivery guarantees', () => {
  const evt = {
    id: 'evt_dup', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active', metadata: { userId: 'u1', kind: 'membership' } } },
  };

  it('processes an event once and skips the replay', async () => {
    await POST(req(evt));
    const after = db.writes.length;
    const res = await POST(req(evt));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(db.writes.length).toBe(after);
  });

  it('does not send a second payment-failed email on a replay', async () => {
    const failed = { id: 'evt_f2', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } };
    (stripe.subscriptions as { retrieve: unknown }).retrieve = async () => ({ id: 'sub_1', status: 'past_due', metadata: { userId: 'u1' } });
    await POST(req(failed));
    await POST(req(failed));
    expect(sentEmails).toHaveLength(1);
  });

  it('returns 500 so Stripe retries, and does NOT mark the event processed', async () => {
    (stripe.subscriptions as { retrieve: unknown }).retrieve = async () => { throw new Error('Firestore blip'); };
    const boom = { id: 'evt_boom', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } };
    const res = await POST(req(boom));
    expect(res.status).toBe(500);
    expect(db.wroteTo('stripeEvents/evt_boom')).toBe(false);
  });

  it('ignores unknown event types without error', async () => {
    const res = await POST(req({ id: 'evt_x', type: 'invoice.upcoming', data: { object: {} } }));
    expect(res.status).toBe(200);
    expect(db.wroteTo(USER)).toBe(false);
  });
});
