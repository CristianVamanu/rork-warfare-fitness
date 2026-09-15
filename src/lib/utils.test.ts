import { describe, it, expect } from 'vitest';
import { stripUndefinedDeep, getActiveDiscountPercent, applyDiscount, kgToLbs, lbsToKg, buildTrialTerms, getCheapestEntryPrice } from './utils';

describe('stripUndefinedDeep', () => {
  it('removes undefined keys at the top level', () => {
    expect(stripUndefinedDeep({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it('removes undefined keys nested inside objects', () => {
    expect(stripUndefinedDeep({ a: { b: 1, c: undefined } })).toEqual({ a: { b: 1 } });
  });

  it('recurses into arrays without dropping array elements', () => {
    expect(stripUndefinedDeep({ list: [{ a: 1, b: undefined }, { a: 2 }] }))
      .toEqual({ list: [{ a: 1 }, { a: 2 }] });
  });

  it('keeps null values (only undefined is stripped)', () => {
    expect(stripUndefinedDeep({ a: null, b: undefined })).toEqual({ a: null });
  });

  it('leaves primitives untouched', () => {
    expect(stripUndefinedDeep(5)).toBe(5);
    expect(stripUndefinedDeep('x')).toBe('x');
  });
});

describe('getActiveDiscountPercent', () => {
  it('returns 0 when there is no config', () => {
    expect(getActiveDiscountPercent(null)).toBe(0);
    expect(getActiveDiscountPercent(undefined)).toBe(0);
  });

  it('returns 0 when discountPercent is missing or zero', () => {
    expect(getActiveDiscountPercent({ discountExpiresAt: new Date(Date.now() + 86400000).toISOString() })).toBe(0);
    expect(getActiveDiscountPercent({ discountPercent: 0, discountExpiresAt: new Date(Date.now() + 86400000).toISOString() })).toBe(0);
  });

  it('returns the percent when the discount is still active', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(getActiveDiscountPercent({ discountPercent: 20, discountExpiresAt: future })).toBe(20);
  });

  it('returns 0 once the discount has expired', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(getActiveDiscountPercent({ discountPercent: 20, discountExpiresAt: past })).toBe(0);
  });
});

describe('applyDiscount', () => {
  it('applies a percentage discount correctly', () => {
    expect(applyDiscount(100, 20)).toBe(80);
    expect(applyDiscount(49.99, 10)).toBeCloseTo(44.99, 2);
  });

  it('returns the original price at 0% discount', () => {
    expect(applyDiscount(100, 0)).toBe(100);
  });
});

describe('kg/lbs conversion round-trip', () => {
  it('converts kg to lbs correctly', () => {
    expect(kgToLbs(100)).toBeCloseTo(220.5, 0);
  });

  it('converts lbs to kg correctly', () => {
    expect(lbsToKg(220.5)).toBeCloseTo(100, 0);
  });

  it('round-trips within rounding tolerance', () => {
    const original = 82.5;
    const roundTripped = lbsToKg(kgToLbs(original));
    expect(roundTripped).toBeCloseTo(original, 0);
  });
});

describe('getCheapestEntryPrice', () => {
  it('returns null when no plan has any price', () => {
    expect(getCheapestEntryPrice([{}, { priceMonthly: 0 }])).toBeNull();
  });

  it('picks the lowest per-month cost across plans and terms', () => {
    const cheapest = getCheapestEntryPrice([
      { priceMonthly: 49 },
      { priceMonthly: 19, price12mo: 180 }, // 180/12 = 15/mo, the winner
    ]);
    expect(cheapest).toMatchObject({ months: 12, price: 180 });
  });
});

describe('buildTrialTerms', () => {
  const plans = [{ priceMonthly: 49 }, { priceMonthly: 19 }];

  it('quotes the ENTRY price, not the featured plan, on a paid trial', () => {
    // The bug this helper exists for: the hero printed "then $49.00/mo" under
    // a $1 button while a $19 tier was on sale further down the same page.
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: true, cardUpFrontTrial: false, trialPriceCents: 100, plans });
    expect(t.ctaLabel).toBe('Start for $1.00');
    expect(t.disclosure).toBe('$1.00 for 7 days, then from $19.00/mo. Cancel anytime.');
  });

  it('drops the "from" when there is only one plan to choose', () => {
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: true, cardUpFrontTrial: false, plans: [{ priceMonthly: 49 }] });
    expect(t.disclosure).toBe('$1.00 for 7 days, then $49.00/mo. Cancel anytime.');
  });

  it('never renders a non-monthly term as a per-month price', () => {
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: true, cardUpFrontTrial: false, plans: [{ price6mo: 99 }] });
    expect(t.disclosure).toBe('$1.00 for 7 days, then $99.00 every 6 months. Cancel anytime.');
  });

  it('still states the terms when the plans fetch failed', () => {
    // page.tsx fetches plans with .catch(() => []) — an empty list must not
    // strip the renewal terms off a button that still says "$1.00".
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: true, cardUpFrontTrial: false, plans: [] });
    expect(t.disclosure).toBe("$1.00 for 7 days, then your plan's regular price. Cancel anytime.");
  });

  it('says a card-up-front free trial converts into a charge', () => {
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: false, cardUpFrontTrial: true, plans });
    expect(t.ctaLabel).toBe('Start 7-Day Free Trial');
    expect(t.disclosure).toContain('then from $19.00/mo');
  });

  it('only claims "no credit card required" when that is actually true', () => {
    const t = buildTrialTerms({ trialDays: 7, paidTrialEnabled: false, cardUpFrontTrial: false, plans });
    expect(t.disclosure).toBe('Free for 7 days. No credit card required.');
  });

  it('falls back to the admin CTA label when there is no trial', () => {
    const t = buildTrialTerms({ trialDays: 0, paidTrialEnabled: true, cardUpFrontTrial: false, plans, noTrialCtaLabel: 'Join Now' });
    expect(t.ctaLabel).toBe('Join Now');
    expect(t.disclosure).toBe('From $19.00/mo. Cancel anytime.');
  });
});
