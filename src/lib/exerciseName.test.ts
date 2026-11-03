import { describe, it, expect } from 'vitest';
import { exerciseKey, sameExercise } from './exerciseName';

describe('exerciseKey', () => {
  it('merges spelling variants of the same lift', () => {
    expect(sameExercise('Bench Press', 'Barbell Bench Press')).toBe(true);
    expect(sameExercise('bench press ', 'Bench Presses')).toBe(true);
    expect(sameExercise('Pull-Ups', 'pullup')).toBe(true);
    expect(sameExercise('Bicep Curls', 'bicep curl')).toBe(true);
    expect(sameExercise('DB Shoulder Press', 'Dumbbell Shoulder Press')).toBe(true);
    expect(sameExercise('RDL', 'Romanian Deadlift')).toBe(true);
    expect(sameExercise('Flat Bench Press', 'Bench Press')).toBe(true);
  });

  it('keeps lifts that are genuinely different apart', () => {
    expect(sameExercise('Dumbbell Bench Press', 'Bench Press')).toBe(false);
    expect(sameExercise('Incline Bench Press', 'Bench Press')).toBe(false);
    expect(sameExercise('Front Squat', 'Back Squat')).toBe(false);
    expect(sameExercise('Lat Pulldown', 'Pull Up')).toBe(false);
  });

  it('handles empty input', () => {
    expect(exerciseKey('')).toBe('');
    expect(sameExercise('', '')).toBe(false);
  });
});
