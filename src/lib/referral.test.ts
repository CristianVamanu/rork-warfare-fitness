import { describe, it, expect } from 'vitest';
import { generateReferralCode, isValidReferralCode } from './referral';

describe('generateReferralCode', () => {
  it('is the requested length', () => {
    expect(generateReferralCode(7)).toHaveLength(7);
    expect(generateReferralCode(4)).toHaveLength(4);
  });

  it('never contains a visually-ambiguous character', () => {
    // 0/O, 1/I/L are exactly the mistakes someone reading a code off a
    // phone screen to a friend actually makes.
    const ambiguous = /[01IOL]/;
    for (let i = 0; i < 500; i++) {
      expect(generateReferralCode()).not.toMatch(ambiguous);
    }
  });

  it('is not deterministic', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe('isValidReferralCode', () => {
  it('accepts a well-formed code', () => {
    expect(isValidReferralCode('X7K2M9A')).toBe(true);
  });

  it('rejects the ambiguous characters even if someone crafts one by hand', () => {
    expect(isValidReferralCode('O0IL1XX')).toBe(false);
  });

  it('rejects non-strings, empty strings and out-of-range lengths', () => {
    expect(isValidReferralCode(undefined)).toBe(false);
    expect(isValidReferralCode(null)).toBe(false);
    expect(isValidReferralCode(123)).toBe(false);
    expect(isValidReferralCode('')).toBe(false);
    expect(isValidReferralCode('AB')).toBe(false);
    expect(isValidReferralCode('X'.repeat(17))).toBe(false);
  });

  it('rejects lowercase and punctuation — codes are generated uppercase only', () => {
    expect(isValidReferralCode('x7k2m9a')).toBe(false);
    expect(isValidReferralCode('X7K2-M9')).toBe(false);
  });
});
