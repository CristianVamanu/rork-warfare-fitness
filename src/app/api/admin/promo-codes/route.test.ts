import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb } from '@/test/fakeAdminDb';

/**
 * What actually gets sent to Stripe when a code is created.
 *
 * Stripe enforces how long a discount lasts; this route only has to describe
 * it correctly, and a wrong field here is the expensive kind of quiet. Sending
 * no duration at all means "forever", so a code meant to run for one month and
 * a code that never ends differ by one property that nobody would notice was
 * missing until a member had been paying 25% less for a year.
 */

let db = makeAdminDb();
let coupons: Array<Record<string, unknown>> = [];
let promos: Array<Record<string, unknown>> = [];
let products: string[] = [];

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAdmin: async () => ({ uid: 'admin' }) }));
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    coupons: {
      create: async (p: Record<string, unknown>) => { coupons.push(p); return { id: `co_${coupons.length}` }; },
    },
    promotionCodes: {
      list: async () => ({ data: [] }),
      create: async (p: Record<string, unknown>) => { promos.push(p); return { id: 'promo_1', code: p.code }; },
    },
    products: {
      retrieve: async (id: string) => ({ id, name: 'x', active: true }),
      create: async ({ id }: { id: string }) => { products.push(id); return { id }; },
      update: async () => ({}),
    },
  }),
}));

const { POST } = await import('./route');

const create = (body: Record<string, unknown>) => POST(new Request('http://x/api/admin/promo-codes', {
  method: 'POST',
  headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'FORCES25', percentOff: 25, ...body }),
}) as never);

beforeEach(() => {
  db = makeAdminDb();
  coupons = []; promos = []; products = [];
  db.docs.set('config/membershipPlans', {
    plans: [
      { id: 'p_conquer', name: 'Conquer', priceMonthly: 29.99, currency: 'USD', active: true },
      { id: 'p_vanguard', name: 'Vanguard', priceMonthly: 49.99, currency: 'USD', active: true },
    ],
  });
  db.docs.set('config/coachingPlans', { plans: [] });
});

describe('how long the discount lasts', () => {
  it('sends the month count for a time-limited code', async () => {
    const res = await create({ duration: 'repeating', durationInMonths: 1 });
    expect(res.status).toBe(200);
    expect(coupons[0]).toMatchObject({ percent_off: 25, duration: 'repeating', duration_in_months: 1 });
  });

  it('sends no month count for a forever code', async () => {
    await create({ duration: 'forever' });
    expect(coupons[0].duration).toBe('forever');
    expect(coupons[0]).not.toHaveProperty('duration_in_months');
  });

  it('refuses a time-limited code with no length', async () => {
    // Without this the coupon would be created as repeating with no month
    // count, which Stripe rejects — but only after the admin thought they had
    // made a code.
    const res = await create({ duration: 'repeating' });
    expect(res.status).toBe(400);
    expect(coupons).toHaveLength(0);
  });

  it('refuses a length beyond three years', async () => {
    expect((await create({ duration: 'repeating', durationInMonths: 60 })).status).toBe(400);
  });
});

describe('how long the code stays redeemable', () => {
  it('passes the expiry to Stripe as a unix timestamp', async () => {
    const when = new Date(Date.now() + 30 * 86_400_000);
    await create({ duration: 'forever', expiresAt: when.toISOString() });
    expect(promos[0].expires_at).toBe(Math.floor(when.getTime() / 1000));
  });

  it('refuses an expiry in the past', async () => {
    const res = await create({ duration: 'forever', expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(res.status).toBe(400);
    expect(promos).toHaveLength(0);
  });

  it('caps the number of redemptions when asked', async () => {
    await create({ duration: 'forever', maxRedemptions: 1 });
    expect(promos[0].max_redemptions).toBe(1);
  });

  it('leaves it unlimited when not asked', async () => {
    await create({ duration: 'forever' });
    expect(promos[0]).not.toHaveProperty('max_redemptions');
  });
});

describe('what the discount applies to', () => {
  it('names no products when the code covers everything', async () => {
    await create({ duration: 'forever' });
    expect(coupons[0]).not.toHaveProperty('applies_to');
  });

  it('restricts to the chosen plan and never to the trial fee', async () => {
    await create({ duration: 'forever', planKeys: ['membership:p_conquer'] });
    const appliesTo = (coupons[0].applies_to as { products: string[] }).products;

    expect(appliesTo).toEqual(['warfarefitness_plan_p_conquer']);
    // The whole point of keeping the trial fee as its own product: a restricted
    // code must come off the real subscription price, not off the one-off
    // dollar.
    expect(appliesTo.some((p) => p.includes('trialfee'))).toBe(false);
    // Vanguard is untouched.
    expect(appliesTo.some((p) => p.includes('p_vanguard'))).toBe(false);
  });

  it('rejects a restriction that matches no real plan', async () => {
    const res = await create({ duration: 'forever', planKeys: ['membership:does_not_exist'] });
    expect(res.status).toBe(400);
    expect(coupons).toHaveLength(0);
  });
});
