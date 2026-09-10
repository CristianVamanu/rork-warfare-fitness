import { describe, it, expect } from 'vitest';
import { resolveOrgDailyLimit, DEFAULT_ORG_DAILY_LIMIT } from './orgAiLimit';

describe('resolveOrgDailyLimit', () => {
  it('applies the default when the setting was never written', () => {
    expect(resolveOrgDailyLimit(undefined)).toBe(DEFAULT_ORG_DAILY_LIMIT);
    expect(resolveOrgDailyLimit(null)).toBe(DEFAULT_ORG_DAILY_LIMIT);
  });

  it('treats 0 as "use the default", never as "no ceiling"', () => {
    // This deployment ran with 0 stored for its whole life, which used to
    // mean the org-wide circuit breaker was simply off.
    expect(resolveOrgDailyLimit(0)).toBe(DEFAULT_ORG_DAILY_LIMIT);
    expect(resolveOrgDailyLimit('0')).toBe(DEFAULT_ORG_DAILY_LIMIT);
  });

  it('honours an explicit positive ceiling, higher or lower than the default', () => {
    expect(resolveOrgDailyLimit(500)).toBe(500);
    expect(resolveOrgDailyLimit(1_000_000)).toBe(1_000_000);
    expect(resolveOrgDailyLimit('750')).toBe(750);
  });

  it('falls back on garbage rather than disabling the cap', () => {
    expect(resolveOrgDailyLimit('lots')).toBe(DEFAULT_ORG_DAILY_LIMIT);
    expect(resolveOrgDailyLimit(-5)).toBe(DEFAULT_ORG_DAILY_LIMIT);
    expect(resolveOrgDailyLimit(NaN)).toBe(DEFAULT_ORG_DAILY_LIMIT);
  });
});
