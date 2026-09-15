import { describe, it, expect } from 'vitest';
import { getProgramDayLimit, isInFreeTrial, freeTrialEndsAt, trialIsStripeManaged } from './membership';
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

const profile = (overrides: Partial<Pick<UserProfile, 'membership' | 'coaching' | 'purchasedProgramIds'>> = {}) => ({
  ...overrides,
}) as Pick<UserProfile, 'membership' | 'coaching' | 'purchasedProgramIds'>;

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

  // Buying a single program outright buys the WHOLE program, not a
  // trial-length preview of it. This regressed in production: a paying
  // customer hit a padlock partway through the program they'd already paid
  // for, and firestore.rules rejected their progress writes to match.
  it('is unlimited for a program the user has actually purchased', () => {
    const p = profile({ purchasedProgramIds: ['p-bought'] });
    expect(getProgramDayLimit(config({ trialDays: 7 }), p, 'p-bought')).toBe(Infinity);
  });

  it('still caps other programs the user has NOT purchased', () => {
    const p = profile({ purchasedProgramIds: ['p-bought'] });
    expect(getProgramDayLimit(config({ trialDays: 7 }), p, 'p-other')).toBe(7);
    // No programId in context at all → cannot claim a purchase.
    expect(getProgramDayLimit(config({ trialDays: 7 }), p)).toBe(7);
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

describe('isInFreeTrial — which trial mode is in force', () => {
  it('grants the createdAt-anchored window in plain free-trial mode', () => {
    expect(isInFreeTrial(config(), daysAgo(3))).toBe(true);
    expect(isInFreeTrial(config(), daysAgo(9))).toBe(false);
  });

  it('grants no free window when the trial is card-up-front', () => {
    // The whole point of the mode: access comes from a real Stripe
    // subscription (which starts in 'trialing'), never from account age. A
    // stale true here would hand out free access alongside the Stripe trial.
    expect(isInFreeTrial(config({ cardUpFrontTrial: true }), daysAgo(1))).toBe(false);
    expect(freeTrialEndsAt(config({ cardUpFrontTrial: true }), daysAgo(1))).toBeNull();
  });

  it('grants no free window when the trial is paid', () => {
    expect(isInFreeTrial(config({ paidTrialEnabled: true }), daysAgo(1))).toBe(false);
  });

  it('treats both Stripe-managed modes identically', () => {
    expect(trialIsStripeManaged(config())).toBe(false);
    expect(trialIsStripeManaged(config({ paidTrialEnabled: true }))).toBe(true);
    expect(trialIsStripeManaged(config({ cardUpFrontTrial: true }))).toBe(true);
  });

  it('still honours a disabled membership over any trial mode', () => {
    expect(isInFreeTrial(config({ enabled: false }), daysAgo(1))).toBe(false);
  });
});
