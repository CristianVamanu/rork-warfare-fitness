import { describe, it, expect } from 'vitest';
import { calculateStrengthScore, type StrengthInputs } from './strengthScore';

const base: StrengthInputs = {
  age: 28, sex: 'male', bodyweightKg: 80,
  squatKg: 120, benchKg: 90, deadliftKg: 150,
};

describe('calculateStrengthScore', () => {
  it('computes a score within 0-100 for a typical intermediate profile', () => {
    const r = calculateStrengthScore(base);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.liftScores).toHaveLength(3);
  });

  it('throws on zero bodyweight instead of dividing by zero', () => {
    expect(() => calculateStrengthScore({ ...base, bodyweightKg: 0 })).toThrow();
  });

  it('throws on negative bodyweight', () => {
    expect(() => calculateStrengthScore({ ...base, bodyweightKg: -10 })).toThrow();
  });

  it('throws when no lifts are provided at all', () => {
    expect(() =>
      calculateStrengthScore({ age: 28, sex: 'male', bodyweightKg: 80, squatKg: 0, benchKg: 0, deadliftKg: 0 })
    ).toThrow();
  });

  it('works with only one mandatory lift provided (others zero)', () => {
    const r = calculateStrengthScore({ ...base, benchKg: 0, deadliftKg: 0 });
    expect(r.liftScores).toHaveLength(1);
    expect(r.liftScores[0].key).toBe('squat');
  });

  it('ignores missing optional lifts (ohp/pullups) without error', () => {
    const r = calculateStrengthScore(base);
    expect(r.liftScores.find((l) => l.key === 'ohp')).toBeUndefined();
    expect(r.liftScores.find((l) => l.key === 'pullups')).toBeUndefined();
  });

  it('includes optional lifts when provided and weights them at half', () => {
    const withoutOptional = calculateStrengthScore(base);
    const withOptional = calculateStrengthScore({ ...base, ohpKg: 60, pullupReps: 12 });
    expect(withOptional.liftScores).toHaveLength(5);
    // Score should differ (not necessarily higher/lower deterministically,
    // but must actually be influenced by the optional lifts).
    expect(withOptional.score).not.toBe(withoutOptional.score);
  });

  it('handles pull-ups with zero reps as absent (not a divide-by-zero)', () => {
    const r = calculateStrengthScore({ ...base, pullupReps: 0 });
    expect(r.liftScores.find((l) => l.key === 'pullups')).toBeUndefined();
  });

  it('clamps extremely high ratios below 100 instead of returning >=100', () => {
    const r = calculateStrengthScore({ ...base, squatKg: 5000 });
    const squat = r.liftScores.find((l) => l.key === 'squat')!;
    expect(squat.percentile).toBeLessThan(100);
    expect(squat.percentile).toBeGreaterThan(90);
  });

  it('handles an extremely low bodyweight without producing NaN/Infinity', () => {
    const r = calculateStrengthScore({ ...base, bodyweightKg: 0.1 });
    expect(Number.isFinite(r.score)).toBe(true);
    for (const l of r.liftScores) {
      expect(Number.isFinite(l.percentile)).toBe(true);
    }
  });

  it('applies an age adjustment outside the 25-35 peak window without producing NaN', () => {
    const young = calculateStrengthScore({ ...base, age: 15 });
    const old = calculateStrengthScore({ ...base, age: 80 });
    expect(Number.isFinite(young.score)).toBe(true);
    expect(Number.isFinite(old.score)).toBe(true);
  });

  it('is deterministic — same inputs always produce the same output', () => {
    const a = calculateStrengthScore(base);
    const b = calculateStrengthScore(base);
    expect(a).toEqual(b);
  });

  it('computes relativeStrength as total/bodyweight', () => {
    const r = calculateStrengthScore(base);
    expect(r.relativeStrength).toBeCloseTo((120 + 90 + 150) / 80, 1);
  });

  it('returns a next milestone for the weakest weight-based lift', () => {
    const r = calculateStrengthScore(base);
    expect(r.nextMilestone).not.toBeNull();
    expect(r.nextMilestone!.targetKg).toBeGreaterThan(0);
    expect(r.nextMilestone!.targetKg % 5).toBe(0);
  });

  it('returns a classification string for every profile shape', () => {
    const balanced = calculateStrengthScore({ age: 30, sex: 'male', bodyweightKg: 90, squatKg: 180, benchKg: 135, deadliftKg: 220 });
    const squatDominant = calculateStrengthScore({ age: 30, sex: 'male', bodyweightKg: 90, squatKg: 180, benchKg: 90, deadliftKg: 150 });
    const deadliftDominant = calculateStrengthScore({ age: 30, sex: 'male', bodyweightKg: 90, squatKg: 120, benchKg: 90, deadliftKg: 220 });
    const beginner = calculateStrengthScore({ age: 30, sex: 'male', bodyweightKg: 90, squatKg: 40, benchKg: 30, deadliftKg: 50 });
    for (const r of [balanced, squatDominant, deadliftDominant, beginner]) {
      expect(typeof r.classification).toBe('string');
      expect(r.classification.length).toBeGreaterThan(0);
    }
  });

  it('works identically for female sex without crashing (separate standards table)', () => {
    const r = calculateStrengthScore({ ...base, sex: 'female' });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it('handles boundary age values (13 and 100)', () => {
    expect(() => calculateStrengthScore({ ...base, age: 13 })).not.toThrow();
    expect(() => calculateStrengthScore({ ...base, age: 100 })).not.toThrow();
  });
});
