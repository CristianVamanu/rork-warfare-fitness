import { describe, it, expect } from 'vitest';
import { sessionsIntoWeek } from './programWeek';

describe('the "This week" bars', () => {
  it('start empty before the first session', () => {
    expect(sessionsIntoWeek(0, 6)).toBe(0);
  });

  it('fill one bar per session', () => {
    expect(sessionsIntoWeek(1, 6)).toBe(1);
    expect(sessionsIntoWeek(2, 6)).toBe(2);
    expect(sessionsIntoWeek(5, 6)).toBe(5);
  });

  it('stay FULL after the last session of the week — the bug this fixes', () => {
    // Was completed % daysPerWeek, which is 0 here: finish session 6 of 6,
    // open Home, see "0/6" with every bar dark.
    expect(sessionsIntoWeek(6, 6)).toBe(6);
    expect(sessionsIntoWeek(4, 4)).toBe(4);
    expect(sessionsIntoWeek(3, 3)).toBe(3);
  });

  it('advance to one bar when the next week begins', () => {
    expect(sessionsIntoWeek(7, 6)).toBe(1);
    expect(sessionsIntoWeek(13, 6)).toBe(1);
  });

  it('read full at the end of a program', () => {
    // A program is a whole number of weeks, so its last session is always
    // a multiple of daysPerWeek. "Complete" must not sit beside an empty
    // strip.
    expect(sessionsIntoWeek(78, 6)).toBe(6);  // 13 weeks × 6
    expect(sessionsIntoWeek(48, 4)).toBe(4);  // 12 weeks × 4
  });

  it('never returns more bars than the week has', () => {
    for (let c = 0; c <= 40; c++) {
      for (const d of [3, 4, 5, 6]) {
        const n = sessionsIntoWeek(c, d);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(d);
      }
    }
  });

  it('is harmless on bad input', () => {
    expect(sessionsIntoWeek(5, 0)).toBe(0);
    expect(sessionsIntoWeek(-3, 6)).toBe(0);
    expect(sessionsIntoWeek(NaN, 6)).toBe(0);
    expect(sessionsIntoWeek(5, NaN)).toBe(0);
  });
});
