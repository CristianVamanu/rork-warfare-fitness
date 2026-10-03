import { describe, it, expect } from 'vitest';
import { ageBracketFor } from './ageBracket';

describe('placing an age in a bracket', () => {
  it('uses the four brackets the admin can tick', () => {
    expect(ageBracketFor(18)).toBe('18-29');
    expect(ageBracketFor(29)).toBe('18-29');
    expect(ageBracketFor(30)).toBe('30-39');
    expect(ageBracketFor(39)).toBe('30-39');
    expect(ageBracketFor(40)).toBe('40-49');
    expect(ageBracketFor(49)).toBe('40-49');
    expect(ageBracketFor(50)).toBe('50-plus');
    expect(ageBracketFor(73)).toBe('50-plus');
  });

  it('gives no bracket when age is unknown, so nothing is excluded', () => {
    expect(ageBracketFor(undefined)).toBeUndefined();
    expect(ageBracketFor(null)).toBeUndefined();
    expect(ageBracketFor(NaN)).toBeUndefined();
    expect(ageBracketFor(Infinity)).toBeUndefined();
  });

  it('gives no bracket under 18', () => {
    expect(ageBracketFor(17)).toBeUndefined();
    expect(ageBracketFor(0)).toBeUndefined();
    expect(ageBracketFor(-5)).toBeUndefined();
  });
});
