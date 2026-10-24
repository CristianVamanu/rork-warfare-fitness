import { describe, it, expect } from 'vitest';
import { resolvePlanLock } from './planAccess';
import type { MembershipPlan } from '@/types';

const plan = (featureAccess: string[]): MembershipPlan => ({
  id: 'p', name: 'Plan', description: '', currency: 'USD', features: [],
  featureAccess, active: true,
});

// The two tiers as they are meant to be configured.
const CONQUER = plan(['nutrition-ai']);
const VANGUARD = plan(['nutrition-ai', 'barcode', 'meal-planner', 'premium-programs', 'scan-and-go']);
const UNRESTRICTED = plan([]);

describe('resolvePlanLock — the entry tier keeps its own program', () => {
  it('never locks the member out of the program onboarding assigned them', () => {
    // The bug this exists to prevent: pay $19, open your own workout, hit a
    // paywall. Every program is flagged premium, so this is the default
    // outcome without the exception.
    const r = resolvePlanLock(CONQUER, undefined, 'sas-selection', 'sas-selection');
    expect(r.isLocked).toBe(false);
  });

  it('locks a different program — that is what the upgrade sells', () => {
    expect(resolvePlanLock(CONQUER, undefined, 'alpha-bulk', 'sas-selection').isLocked).toBe(true);
  });

  it('reports the library as locked so the browse list can badge it', () => {
    expect(resolvePlanLock(CONQUER, undefined, undefined, 'sas-selection').otherProgramsLocked).toBe(true);
    expect(resolvePlanLock(VANGUARD, undefined, undefined, 'sas-selection').otherProgramsLocked).toBe(false);
  });
});

describe('resolvePlanLock — features', () => {
  it('allows a feature the plan lists and locks one it does not', () => {
    expect(resolvePlanLock(CONQUER, 'nutrition-ai', undefined, undefined).isLocked).toBe(false);
    expect(resolvePlanLock(CONQUER, 'barcode', undefined, undefined).isLocked).toBe(true);
    expect(resolvePlanLock(CONQUER, 'meal-planner', undefined, undefined).isLocked).toBe(true);
  });

  it('the top tier unlocks everything it lists, including the library', () => {
    for (const f of ['nutrition-ai', 'barcode', 'meal-planner', 'scan-and-go']) {
      expect(resolvePlanLock(VANGUARD, f, undefined, undefined).isLocked, f).toBe(false);
    }
    expect(resolvePlanLock(VANGUARD, undefined, 'any-program', 'other').isLocked).toBe(false);
  });

  it('a locked feature stays locked even on the member\'s own program screen', () => {
    // Own-program is an exception for the PROGRAM gate only — it must not
    // leak into feature gating, or the entry tier would unlock the meal
    // planner just by being opened from inside their own program.
    expect(resolvePlanLock(CONQUER, 'meal-planner', 'sas-selection', 'sas-selection').isLocked).toBe(true);
  });
});

describe('resolvePlanLock — plans that restrict nothing', () => {
  it('an empty featureAccess list is a full-access plan', () => {
    expect(resolvePlanLock(UNRESTRICTED, 'barcode', 'anything', undefined).isLocked).toBe(false);
    expect(resolvePlanLock(UNRESTRICTED, undefined, undefined, undefined).otherProgramsLocked).toBe(false);
  });

  it('no plan resolved is treated as unrestricted, not as locked', () => {
    // A member whose planId no longer matches any plan (renamed, deleted)
    // must not be locked out of what they are paying for.
    expect(resolvePlanLock(null, 'barcode', 'anything', undefined).isLocked).toBe(false);
  });

  it('does not treat a missing own-program as matching a missing programId', () => {
    expect(resolvePlanLock(CONQUER, undefined, undefined, undefined).isLocked).toBe(false);
    expect(resolvePlanLock(CONQUER, undefined, 'alpha-bulk', undefined).isLocked).toBe(true);
  });
});
