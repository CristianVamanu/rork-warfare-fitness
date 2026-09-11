import { describe, it, expect } from 'vitest';
import { matchExerciseNames, tokenize } from './exerciseMatch';

/**
 * Every REJECT case below is a pairing that is live in the catalogue right
 * now, found by auditing what each program's videoUrl actually points at. A
 * member opening these is shown a different movement than the one they were
 * told to do.
 */
describe('matchExerciseNames — refuses the wrong movement', () => {
  const badPairs: [string, string][] = [
    ['Band Pull-Apart', 'Band Twist'],
    ['Face Pull with Band', 'Band Twist'],
    ['Dumbbell Hip Thrust', 'Dumbbell Deadlift'],
    ['Side-Lying Clamshell', 'Side Bridge'],
    ['Mobility Exercises', 'Barbell Shrug'],
    ['Dumbbell Overhead Press', 'Decline Dumbbell Bench Press'],
    ['Band Lateral Raise', 'Cable Lateral Raise'],
    ['Single-Arm Dumbbell Tricep Extension', 'Dumbbell Single Leg Squat'],
    ['Mid-Back Row Machine', 'Cable Straight Back Seated Row'],
  ];

  for (const [exercise, library] of badPairs) {
    it(`refuses "${exercise}" → "${library}"`, () => {
      const r = matchExerciseNames(exercise, library);
      expect(r.ok).toBe(false);
      expect(r.reason).toBeTruthy();
    });
  }
});

describe('matchExerciseNames — still accepts the real ones', () => {
  const goodPairs: [string, string][] = [
    // The case the original loose matcher existed to catch: verbose uploaded
    // filename vs generic generated name.
    ['Bicycle Crunch', '45 Degree Bicycle Twisting Crunches'],
    ['Pull Ups', 'Pull Up'],
    ['Mountain Climbers', 'Mountain Climber'],
    ['Push-Ups', 'Push Ups'],
    ['Chin Ups', 'Chin-Ups'],
    ['Cable Lateral Raise', 'Cable Lateral Raises'],
    ['Goblet Squat', 'Goblet Squat'],
  ];

  for (const [exercise, library] of goodPairs) {
    it(`accepts "${exercise}" → "${library}"`, () => {
      expect(matchExerciseNames(exercise, library).ok).toBe(true);
    });
  }
});

describe('the specific arithmetic that caused this', () => {
  it('no longer lets one shared word carry a short library name', () => {
    // "band" shared, shorter name is 2 words → the old rule scored this 0.5
    // and its threshold was 0.5, so it matched. Union-based scoring puts it
    // at 1/4, and the movement rule rejects it before that even matters.
    const r = matchExerciseNames('Band Pull-Apart', 'Band Twist');
    expect(r.score).toBeLessThan(0.5);
    expect(r.ok).toBe(false);
  });

  it('treats equipment as mutually exclusive, not as agreement', () => {
    const r = matchExerciseNames('Band Lateral Raise', 'Cable Lateral Raise');
    expect(r.reason).toContain('contradictory');
  });
});

describe('tokenize', () => {
  it('stems plurals so a trailing s cannot break a match', () => {
    expect(tokenize('Mountain Climbers')).toEqual(tokenize('Mountain Climber'));
    expect(tokenize('Crunches')).toEqual(tokenize('Crunch'));
  });

  it('drops filler that carries no meaning for matching', () => {
    expect(tokenize('45 Degree Side Bend')).toEqual(['side', 'bend']);
  });

  it('survives empty and punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(matchExerciseNames('', 'Squat').ok).toBe(false);
    expect(matchExerciseNames('---', 'Squat').ok).toBe(false);
  });
});
