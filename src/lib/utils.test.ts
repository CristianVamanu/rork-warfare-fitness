import { describe, it, expect } from 'vitest';
import { stripUndefinedDeep, getActiveDiscountPercent, applyDiscount, kgToLbs, lbsToKg } from './utils';

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
