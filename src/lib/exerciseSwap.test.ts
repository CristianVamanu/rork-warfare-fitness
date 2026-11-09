import { describe, it, expect } from 'vitest';
import { swapOptions, movementPattern } from './exerciseSwap';

describe('exerciseSwap', () => {
  it('finds the movement pattern', () => {
    expect(movementPattern('Barbell Bench Press')).toBe('chest press');
    expect(movementPattern('Incline Dumbbell Press')).toBe('incline press');
    expect(movementPattern('Romanian Deadlift')).toBe('hinge');
    expect(movementPattern('Hammer Curl')).toBe('biceps');
    expect(movementPattern('Leg Curl')).toBe('hamstrings');
    expect(movementPattern('Lat Pulldown')).toBe('vertical pull');
  });

  it('offers same-movement swaps without the current lift', () => {
    const names = swapOptions({ name: 'Bench Press' }).map((o) => o.name);
    expect(names).toContain('Dumbbell Bench Press');
    expect(names).not.toContain('Bench Press');
  });

  it('adds library lifts on the same muscles, with their videos', () => {
    const lib = [
      { name: 'Barbell Bench Press', muscleGroups: ['Chest', 'Triceps'], videoUrl: 'a.mp4' },
      { name: 'Cable Fly', muscleGroups: ['Chest'], videoUrl: 'b.mp4' },
      { name: 'Leg Press', muscleGroups: ['Quads'], videoUrl: 'c.mp4' },
    ];
    const opts = swapOptions({ name: 'Bench Press' }, lib);
    expect(opts.find((o) => o.name === 'Cable Fly')?.videoUrl).toBe('b.mp4');
    expect(opts.find((o) => o.name === 'Leg Press')).toBeUndefined();
    expect(opts.find((o) => o.name === 'Barbell Bench Press')).toBeUndefined();
  });

  it('returns nothing for an unknown lift with no library match', () => {
    expect(swapOptions({ name: 'Zercher Carry' })).toEqual([]);
  });
});

describe('swap options stay in the same movement', () => {
  const lib = [
    { name: 'Walking Lunges', muscleGroups: ['Legs', 'Full Body'] },
    { name: 'Lat Pulldown', muscleGroups: ['Back', 'Lats'] },
    { name: 'Inverted Row', muscleGroups: ['Back'] },
  ];
  it('never offers lunges for pull-ups, even on a full-body day', () => {
    const names = swapOptions({ name: 'Pull-Ups', muscleGroup: 'Full Body' }, lib).map((o) => o.name);
    expect(names).not.toContain('Walking Lunges');
    expect(names).toContain('Lat Pulldown');
  });
  it('ignores muscle tags of a different movement pattern', () => {
    const names = swapOptions({ name: 'Pull-Ups', muscleGroup: 'Legs' }, lib).map((o) => o.name);
    expect(names).not.toContain('Walking Lunges');
  });
});
