import { describe, it, expect } from 'vitest';
import { easedSets, easeExercises, easeSummary } from './recoveryEase';

describe('recoveryEase', () => {
  it('drops sets by volume', () => {
    expect([1, 2, 3, 4, 5, 6].map(easedSets)).toEqual([1, 2, 2, 3, 3, 4]);
  });

  it('leaves cardio and HIIT alone and keeps other fields', () => {
    const out = easeExercises([
      { id: 'a', sets: 5, reps: 5 },
      { id: 'b', sets: 8, isHiit: true },
      { id: 'c', sets: 3, muscleGroup: 'Cardio' },
    ] as { id: string; sets: number; reps?: number; isHiit?: boolean; muscleGroup?: string }[]);
    expect(out.map(e => e.sets)).toEqual([3, 8, 3]);
    expect(out[0]).toMatchObject({ id: 'a', reps: 5 });
  });

  it('summarises total sets', () => {
    expect(easeSummary([{ sets: 5 }, { sets: 4 }, { sets: 3 }])).toEqual({ before: 12, after: 8 });
  });
});
