import { describe, it, expect, vi } from 'vitest';
vi.mock('./firebase', () => ({ db: {}, auth: {} }));
import { computeStreak } from './events';

const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const days = (...offsets: number[]) => new Set(offsets.map((o) => key(new Date(2026, 8, 20 - o))));
const NOW = new Date(2026, 8, 20, 18);

describe('computeStreak with rest days', () => {
  it('counts training days across up to two rest days', () => {
    // Mon/Wed/Fri style: trained 0, 2, 4, 7 days ago.
    expect(computeStreak(days(0, 2, 4, 7), false, NOW)).toEqual({ streak: 4, freezeConsumed: false });
  });
  it('today not trained yet is not a miss', () => {
    expect(computeStreak(days(2, 4), false, NOW).streak).toBe(2);
  });
  it('breaks after three missed days, unless a freeze covers one', () => {
    expect(computeStreak(days(4, 5), false, NOW).streak).toBe(0);
    expect(computeStreak(days(4, 5), true, NOW)).toEqual({ streak: 2, freezeConsumed: true });
    expect(computeStreak(days(5, 6), true, NOW).streak).toBe(0);
  });
});
