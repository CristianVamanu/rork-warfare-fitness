import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb } from '@/test/fakeAdminDb';

/**
 * The finance refund endpoint is the one place the dashboard moves money.
 * It must refuse non-admins, unconfirmed requests and over-refunds, and
 * pass a stable idempotency key so a double click refunds once.
 */
let db = makeAdminDb();
let isAdmin = true;
let refunds: { params: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
let charge = { id: 'ch_1', status: 'succeeded', amount: 1000, amount_refunded: 200, currency: 'gbp' };

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAdmin: async () => (isAdmin ? { uid: 'admin1' } : { error: 'Access denied: admin only', status: 403 }) }));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    charges: { retrieve: async () => ({ ...charge, created: 1, refunds: { data: [] } }) },
    refunds: { create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => { refunds.push({ params, opts }); return { id: 're_1', status: 'succeeded', amount: params.amount, currency: 'gbp', charge: 'ch_1', created: 2 }; } },
  }),
}));

const { POST } = await import('./route');
const call = (body: Record<string, unknown>) => POST(new Request('http://x/api/admin/finance/refund', {
  method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
  body: JSON.stringify({ chargeId: 'ch_1', amount: 500, reason: 'requested_by_customer', confirm: 'REFUND', requestId: 'req-12345678', ...body }),
}) as never);

beforeEach(() => { db = makeAdminDb(); isAdmin = true; refunds = []; charge = { id: 'ch_1', status: 'succeeded', amount: 1000, amount_refunded: 200, currency: 'gbp' }; });

describe('POST /api/admin/finance/refund', () => {
  it('refuses a non-admin before touching Stripe', async () => {
    isAdmin = false;
    const res = await call({});
    expect(res.status).toBe(403);
    expect(refunds).toHaveLength(0);
  });
  it('refuses without the explicit confirmation', async () => {
    expect((await call({ confirm: 'yes' })).status).toBe(400);
    expect(refunds).toHaveLength(0);
  });
  it('refuses more than is still refundable on the charge (checked live against Stripe)', async () => {
    const res = await call({ amount: 900 }); // 1000 - 200 already refunded = 800
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/At most 800/);
    expect(refunds).toHaveLength(0);
  });
  it('refuses non-integer or negative amounts', async () => {
    expect((await call({ amount: 1.5 })).status).toBe(400);
    expect((await call({ amount: -5 })).status).toBe(400);
  });
  it('issues one refund with an idempotency key derived from the request id', async () => {
    const res = await call({});
    expect(res.status).toBe(200);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].params).toMatchObject({ charge: 'ch_1', amount: 500, reason: 'requested_by_customer' });
    expect(refunds[0].opts).toEqual({ idempotencyKey: 'admin-refund-req-12345678' });
  });
});
