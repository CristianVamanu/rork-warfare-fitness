import { describe, it, expect } from 'vitest';
import { suggest, increment, roundLoad } from './progression';

const sets = (w: number, ...reps: number[]) => reps.map((r) => ({ weight: w, reps: r }));

describe('progression', () => {
  it('adds weight when every set hit the target', () => {
    const s = suggest('Barbell Bench Press', 5, [sets(80, 5, 5, 6)], 'kg')!;
    expect(s).toMatchObject({ kind: 'increase', weight: 82.5, reps: 5 });
    expect(suggest('Back Squat', 5, [sets(100, 5, 5, 5)], 'kg')!.weight).toBe(105);
    expect(suggest('Dumbbell Curl', 10, [sets(14, 10, 10)], 'kg')!.weight).toBe(16);
    expect(suggest('Bench Press', 5, [sets(185, 5, 5)], 'lbs')!.weight).toBe(190);
  });

  it('repeats the weight and asks for one more rep when close', () => {
    const s = suggest('Overhead Press', 8, [sets(50, 8, 7, 6)], 'kg')!;
    expect(s).toMatchObject({ kind: 'repeat', weight: 50, reps: 7 });
  });

  it('deloads about 10% after two short sessions at the same weight', () => {
    const s = suggest('Bench Press', 8, [sets(90, 5, 5, 4), sets(90, 6, 6, 5)], 'kg')!;
    expect(s).toMatchObject({ kind: 'deload', weight: 80 });
  });

  it('does not deload after one bad day', () => {
    expect(suggest('Bench Press', 8, [sets(90, 5, 5, 4), sets(87.5, 8, 8, 8)], 'kg')!.kind).toBe('repeat');
  });

  it('never adds weight on a recovery session', () => {
    expect(suggest('Bench Press', 5, [sets(80, 5, 5, 5)], 'kg', { recovery: true })).toMatchObject({ kind: 'hold', weight: 80 });
  });

  it('judges the top working weight, ignoring warm-ups', () => {
    const s = suggest('Deadlift', 5, [[{ weight: 60, reps: 5 }, { weight: 140, reps: 5 }, { weight: 140, reps: 5 }]], 'kg')!;
    expect(s).toMatchObject({ kind: 'increase', weight: 145, lastWeight: 140 });
  });

  it('returns null without history', () => {
    expect(suggest('Bench Press', 5, [], 'kg')).toBeNull();
    expect(suggest('Bench Press', 5, [[]], 'kg')).toBeNull();
  });

  it('increments and rounding follow the kit', () => {
    expect(increment('Leg Press', 'kg')).toBe(5);
    expect(increment('Lateral Raise', 'lbs')).toBe(5);
    expect(roundLoad(81, 'Bench Press', 'kg')).toBe(80);
    expect(roundLoad(15, 'Dumbbell Row', 'kg')).toBe(16);
  });
});
