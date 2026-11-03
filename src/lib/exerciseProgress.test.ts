import { describe, it, expect } from 'vitest';
import { exerciseProgress } from './exerciseProgress';

const w = (day: number, name: string, sets: [number, number, boolean][]) => ({
  completedAt: new Date(2026, 10, day),
  exercises: [{ name, sets: sets.map(([weight, reps, completed]) => ({ weight, reps, completed })) }],
});

describe('exerciseProgress', () => {
  it('takes the heaviest completed set per session, oldest first', () => {
    const pts = exerciseProgress([
      w(5, 'Bench Press', [[60, 8, true], [70, 5, true], [80, 1, false]]),
      w(1, 'bench press ', [[55, 8, true]]),
      w(3, 'Squat', [[100, 5, true]]),
    ], 'Bench Press');
    expect(pts.map(p => p.weight)).toEqual([55, 70]);
    expect(pts[1].reps).toBe(5);
  });

  it('ignores sessions with no weighted completed sets and caps the count', () => {
    const many = Array.from({ length: 15 }, (_, i) => w(i + 1, 'Row', [[40 + i, 10, true]]));
    expect(exerciseProgress([...many, w(20, 'Row', [[0, 10, true]])], 'Row', 10)).toHaveLength(10);
  });
});
