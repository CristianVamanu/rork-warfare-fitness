import { describe, it, expect } from 'vitest';
import { absoluteDayNumber, phaseDayOccurrences } from './programs';

describe('absoluteDayNumber', () => {
  it('numbers the first phase from day 1', () => {
    expect(absoluteDayNumber(1, 0)).toBe(1);
    expect(absoluteDayNumber(1, 6)).toBe(7);
  });

  it('never restarts a later phase at day 1 — the whole point', () => {
    // Phase 2 starting at week 5 begins on day 29, not day 1.
    expect(absoluteDayNumber(5, 0)).toBe(29);
    expect(absoluteDayNumber(5, 6)).toBe(35);
    // Phase 3 at week 9.
    expect(absoluteDayNumber(9, 0)).toBe(57);
  });

  it('runs to 91 across a 13-week program', () => {
    expect(absoluteDayNumber(13, 6)).toBe(91);
  });

  it('respects a non-7 template length', () => {
    expect(absoluteDayNumber(3, 0, 5)).toBe(11);
  });

  it('treats a nonsense startWeek as week 1 rather than going negative', () => {
    expect(absoluteDayNumber(0, 0)).toBe(1);
    expect(absoluteDayNumber(-4, 2)).toBe(3);
  });
});

describe('phaseDayOccurrences', () => {
  it('lists every day a repeating slot covers', () => {
    // Weeks 5-7, slot 0 → days 29, 36, 43.
    expect(phaseDayOccurrences(5, 7, 0)).toEqual([29, 36, 43]);
  });

  it('returns one day for a single-week phase (a deload week)', () => {
    expect(phaseDayOccurrences(8, 8, 3)).toEqual([53]);
  });

  it('survives a half-finished edit where endWeek is below startWeek', () => {
    expect(phaseDayOccurrences(5, 2, 0)).toEqual([29]);
    expect(phaseDayOccurrences(5, 0, 0)).toEqual([29]);
  });

  it('starts at the same day absoluteDayNumber reports', () => {
    for (const wk of [1, 4, 9, 13]) {
      expect(phaseDayOccurrences(wk, wk + 2, 2)[0]).toBe(absoluteDayNumber(wk, 2));
    }
  });
});
