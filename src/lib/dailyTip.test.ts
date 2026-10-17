import { describe, it, expect } from 'vitest';
import { resolveDateKey, topicFor, fallbackTip, MAX_TIP_CHARS } from './dailyTip';

/**
 * The brief is one shared document per calendar day, so the date key IS the
 * cache key. Get it wrong in one direction and members ahead of UTC read
 * yesterday's tip all morning; get it wrong in the other and the date becomes
 * a free way to make the server pay OpenAI for arbitrary days.
 */

const SERVER = '2026-09-13';

describe('resolveDateKey', () => {
  it('takes the caller’s date when it is today', () => {
    expect(resolveDateKey('2026-09-13', SERVER)).toBe('2026-09-13');
  });

  it('takes it a day either side, which is the whole point', () => {
    // Somebody in Auckland just past midnight, and somebody in Honolulu who
    // has not reached it yet, are both legitimately on a different date.
    expect(resolveDateKey('2026-09-14', SERVER)).toBe('2026-09-14');
    expect(resolveDateKey('2026-09-12', SERVER)).toBe('2026-09-12');
  });

  it('ignores a date further out than any timezone can justify', () => {
    expect(resolveDateKey('2026-12-25', SERVER)).toBe(SERVER);
    expect(resolveDateKey('2020-01-01', SERVER)).toBe(SERVER);
  });

  it('ignores anything that is not a plain date', () => {
    for (const bad of ['', 'today', '13-09-2026', '2026-9-3', '2026-09-13T00:00:00Z', null, undefined]) {
      expect(resolveDateKey(bad, SERVER)).toBe(SERVER);
    }
  });
});

describe('topicFor', () => {
  it('gives the same subject for the same day', () => {
    expect(topicFor('2026-09-13')).toBe(topicFor('2026-09-13'));
  });

  it('moves on with the date', () => {
    const week = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']
      .map(topicFor);
    // Consecutive days must differ, or the brief reads as stuck even when it
    // is being regenerated properly.
    expect(new Set(week).size).toBe(week.length);
  });

  it('always returns a real subject, including before the epoch', () => {
    // A negative modulo would index off the front of the array and hand the
    // prompt the word "undefined".
    for (const d of ['1969-07-20', '1900-01-01', '2100-01-01']) {
      expect(typeof topicFor(d)).toBe('string');
      expect(topicFor(d).length).toBeGreaterThan(0);
    }
  });
});

describe('fallbackTip', () => {
  it('fits the card, so a failed generation still renders', () => {
    // The read path treats an over-long tip as a miss, so a fallback longer
    // than the cap would regenerate on every single dashboard load.
    for (const d of ['2026-09-13', '2026-01-01', '2026-06-30']) {
      expect(fallbackTip(topicFor(d)).length).toBeLessThanOrEqual(MAX_TIP_CHARS);
    }
  });
});
