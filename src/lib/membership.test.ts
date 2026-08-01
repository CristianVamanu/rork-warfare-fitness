import { describe, it, expect } from 'vitest';
import { getProgramDayLimit } from './membership';
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

const profile = (overrides: Partial<Pick<UserProfile, 'membership' | 'coaching'>> = {}) => ({
  ...overrides,
}) as Pick<UserProfile, 'membership' | 'coaching'>;

describe('getProgramDayLimit', () => {
  it('is unlimited when membership config is disabled or missing', () => {
    expect(getProgramDayLimit(null, profile())).toBe(Infinity);
    expect(getProgramDayLimit(config({ enabled: false }), profile())).toBe(Infinity);
  });

  it('is unlimited for an active paying member', () => {
    const p = profile({ membership: { status: 'active' } });
    expect(getProgramDayLimit(config(), p)).toBe(Infinity);
  });

  it('caps at trialDays for a non-member from day one — not just once some calendar window closes', () => {
    // This is the whole point: a brand-new signup with no membership sees
    // exactly `trialDays` days unlocked immediately, same as someone who
    // signed up months ago and never subscribed.
    expect(getProgramDayLimit(config({ trialDays: 7 }), profile())).toBe(7);
  });

  it('caps at 14 or 30 the same way, following whatever trialDays is configured', () => {
    expect(getProgramDayLimit(config({ trialDays: 14 }), profile())).toBe(14);
    expect(getProgramDayLimit(config({ trialDays: 30 }), profile())).toBe(30);
  });

  it('is unlimited when trialDays is 0 (no trial concept configured)', () => {
    expect(getProgramDayLimit(config({ trialDays: 0 }), profile())).toBe(Infinity);
  });

  it('is unaffected by membership.status being anything other than active', () => {
    expect(getProgramDayLimit(config({ trialDays: 7 }), profile({ membership: { status: 'none' } }))).toBe(7);
  });

  it('is unlimited for an active coaching subscriber even with no membership plan', () => {
    // membership and coaching are separate Stripe subscriptions a user can
    // hold independently — coaching is a higher tier, not an alternative,
    // so it must grant at least what a regular membership grants.
    const p = profile({ coaching: { status: 'active' } });
    expect(getProgramDayLimit(config({ trialDays: 7 }), p)).toBe(Infinity);
  });
});
