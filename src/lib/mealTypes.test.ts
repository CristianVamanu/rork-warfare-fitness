import { describe, it, expect } from 'vitest';
import { defaultMealTypeForNow, MEAL_TYPES } from './mealTypes';

const at = (hour: number, minute = 0) => new Date(2026, 8, 10, hour, minute);

describe('defaultMealTypeForNow', () => {
  it('maps each part of the day to the slot a user would expect', () => {
    expect(defaultMealTypeForNow(at(7))).toBe('breakfast');
    expect(defaultMealTypeForNow(at(13))).toBe('lunch');
    expect(defaultMealTypeForNow(at(19))).toBe('dinner');
    expect(defaultMealTypeForNow(at(22))).toBe('snack');
  });

  it('treats the small hours as a snack, not tomorrow morning', () => {
    // The bug this replaces filed late-night food under breakfast.
    expect(defaultMealTypeForNow(at(1))).toBe('snack');
    expect(defaultMealTypeForNow(at(4, 59))).toBe('snack');
  });

  it('switches exactly on the boundary hours', () => {
    expect(defaultMealTypeForNow(at(10, 59))).toBe('breakfast');
    expect(defaultMealTypeForNow(at(11, 0))).toBe('lunch');
    expect(defaultMealTypeForNow(at(15, 59))).toBe('lunch');
    expect(defaultMealTypeForNow(at(16, 0))).toBe('dinner');
    expect(defaultMealTypeForNow(at(20, 59))).toBe('dinner');
    expect(defaultMealTypeForNow(at(21, 0))).toBe('snack');
  });

  it('only ever returns a real meal slot, at every hour of the day', () => {
    for (let h = 0; h < 24; h++) expect(MEAL_TYPES).toContain(defaultMealTypeForNow(at(h)));
  });
});
