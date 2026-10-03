import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  planProductId, coachingProductId, trialFeeProductId, programProductId, getOrCreateProduct,
} from './stripeProducts';

/**
 * These ids are load-bearing in a way most strings are not.
 *
 * They are derived rather than stored, so the derivation IS the lookup. Change
 * how a plan id turns into a product id and every product already in Stripe is
 * orphaned: live subscriptions keep billing against products nothing can find,
 * and every coupon restricted to a plan silently stops matching. The tests
 * below pin the shape so that can only happen on purpose.
 */

describe('product ids', () => {
  it('derives a stable id from the plan id', () => {
    expect(planProductId('mplan_1699999999')).toBe('warfarefitness_plan_mplan_1699999999');
    expect(planProductId('mplan_1699999999')).toBe(planProductId('mplan_1699999999'));
  });

  it('keeps every kind apart for the same underlying id', () => {
    const id = 'mplan_1';
    const ids = new Set([planProductId(id), coachingProductId(id), trialFeeProductId(id), programProductId(id)]);
    // A collision here would let a coupon scoped to the plan also discount the
    // trial fee, which is the exact thing the separation exists to prevent.
    expect(ids.size).toBe(4);
  });

  it('strips characters Stripe will not accept in an id', () => {
    expect(planProductId('a b/c:d')).toBe('warfarefitness_plan_a_b_c_d');
    expect(planProductId('émoji✨')).toMatch(/^warfarefitness_plan_[a-zA-Z0-9_-]*$/);
  });

  it('stays inside Stripe’s length limit', () => {
    expect(planProductId('x'.repeat(400)).length).toBeLessThanOrEqual(255);
  });
});

/** The smallest fake that exercises the branches we care about. */
function fakeStripe(opts: {
  existing?: { id: string; name: string; active: boolean } | null;
  createThrows?: boolean;
  appearsAfterFailedCreate?: boolean;
}) {
  const retrieve = vi.fn(async () => {
    if (opts.existing) return opts.existing;
    if (opts.appearsAfterFailedCreate && create.mock.calls.length > 0) {
      return { id: 'warfarefitness_plan_p1', name: 'Conquer', active: true };
    }
    throw new Error('No such product');
  });
  const create = vi.fn(async (params: { id: string; name: string }) => {
    if (opts.createThrows) throw new Error('resource_already_exists');
    return { id: params.id, name: params.name, active: true };
  });
  const update = vi.fn(async () => ({}));
  return {
    stripe: { products: { retrieve, create, update } } as unknown as Stripe,
    retrieve, create, update,
  };
}

describe('getOrCreateProduct', () => {
  it('creates the product when it does not exist yet', async () => {
    const { stripe, create } = fakeStripe({ existing: null });
    const id = await getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer');
    expect(id).toBe('warfarefitness_plan_p1');
    expect(create).toHaveBeenCalledWith({ id: 'warfarefitness_plan_p1', name: 'Conquer' });
  });

  it('reuses an existing product without touching it', async () => {
    const { stripe, create, update } = fakeStripe({
      existing: { id: 'warfarefitness_plan_p1', name: 'Conquer', active: true },
    });
    const id = await getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer');
    expect(id).toBe('warfarefitness_plan_p1');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resyncs the name after a plan is renamed', async () => {
    const { stripe, update } = fakeStripe({
      existing: { id: 'warfarefitness_plan_p1', name: 'Old name', active: true },
    });
    await getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer');
    // Otherwise the old name is on every future invoice and in the billing
    // portal forever, because the id never changes.
    expect(update).toHaveBeenCalledWith('warfarefitness_plan_p1', { active: true, name: 'Conquer' });
  });

  it('revives an archived product', async () => {
    const { stripe, update } = fakeStripe({
      existing: { id: 'warfarefitness_plan_p1', name: 'Conquer', active: false },
    });
    await getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer');
    // A price cannot reference an archived product at all, so leaving it
    // archived would fail the next checkout rather than merely look untidy.
    expect(update).toHaveBeenCalledWith('warfarefitness_plan_p1', { active: true, name: 'Conquer' });
  });

  it('survives losing a create race to a concurrent checkout', async () => {
    const { stripe } = fakeStripe({ existing: null, createThrows: true, appearsAfterFailedCreate: true });
    // Two people buying the same plan in the same second must not turn into
    // one failed sale.
    await expect(getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer'))
      .resolves.toBe('warfarefitness_plan_p1');
  });

  it('rethrows when the create failed for a real reason', async () => {
    const { stripe } = fakeStripe({ existing: null, createThrows: true, appearsAfterFailedCreate: false });
    // The caller catches this and falls back to an inline product, so the
    // failure must actually reach it rather than being swallowed here.
    await expect(getOrCreateProduct(stripe, 'warfarefitness_plan_p1', 'Conquer')).rejects.toThrow();
  });
});
