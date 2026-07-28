import { describe, it, expect } from 'vitest';
import { isInTrial, getProgramDayLimit } from './membership';
import type { MembershipConfig, UserProfile } from '@/types';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const config = (overrides: Partial<MembershipConfig> = {}): MembershipConfig => ({
  enabled: true,
  trialDays: 7,
  fullLock: false,
  lockedFeatures: [],
  lockedProgramIds: [],
  ...overrides,
});

const profile = (overrides: Partial<Pick<UserProfile, 'createdAt' | 'membership'>> = {}) => ({
  createdAt: daysAgo(3),
  ...overrides,
}) as Pick<UserProfile, 'createdAt' | 'membership'>;

describe('isInTrial', () => {
  it('is true when created within the trial window', () => {
    expect(isInTrial(profile({ createdAt: daysAgo(3) }), 7)).toBe(true);
  });

  it('is false once the trial window has passed', () => {
    expect(isInTrial(profile({ createdAt: daysAgo(10) }), 7)).toBe(false);
  });

  it('is false when trialDays is 0', () => {
    expect(isInTrial(profile({ createdAt: daysAgo(1) }), 0)).toBe(false);
  });

  it('is false with no createdAt', () => {
    expect(isInTrial({ createdAt: undefined }, 7)).toBe(false);
  });
});

describe('getProgramDayLimit', () => {
  it('is unlimited when membership config is disabled or missing', () => {
    expect(getProgramDayLimit(null, profile())).toBe(Infinity);
    expect(getProgramDayLimit(config({ enabled: false }), profile())).toBe(Infinity);
  });

  it('is unlimited for an active paying member, even past the trial window', () => {
    const p = profile({ createdAt: daysAgo(365), membership: { status: 'active' } });
    expect(getProgramDayLimit(config(), p)).toBe(Infinity);
  });

  it('is unlimited for anyone still inside the calendar trial window — matches the existing site-wide trial behavior', () => {
    const p = profile({ createdAt: daysAgo(2) });
    expect(getProgramDayLimit(config({ trialDays: 7 }), p)).toBe(Infinity);
  });

  it('caps at trialDays once the trial window has closed without subscribing', () => {
    const p = profile({ createdAt: daysAgo(10) });
    expect(getProgramDayLimit(config({ trialDays: 7 }), p)).toBe(7);
  });

  it('is unlimited when trialDays is 0 (no trial concept configured)', () => {
    const p = profile({ createdAt: daysAgo(100) });
    expect(getProgramDayLimit(config({ trialDays: 0 }), p)).toBe(Infinity);
  });
});
