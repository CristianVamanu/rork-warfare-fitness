import { describe, it, expect } from 'vitest';
import { judgeRun, ghostSeconds, formatRace, canRaceGhost, type RipzGhost } from './ripzGhost';

const ghost: RipzGhost = { pace: 1.5, count: 20, seconds: 30, at: 0 };

describe('ripz ghost', () => {
  it('scales the ghost to a different pull', () => {
    expect(ghostSeconds(ghost, 30)).toBe(45);
    expect(ghostSeconds(ghost, 7)).toBe(10.5);
  });
  it('first run sets the ghost', () => {
    const v = judgeRun(undefined, 'push-ups', 25, 40, 5);
    expect(v).toMatchObject({ valid: true, beat: null });
    expect(v.next).toEqual({ pace: 1.6, count: 25, seconds: 40, at: 5 });
  });
  it('beating the ghost replaces it, losing keeps it', () => {
    const win = judgeRun(ghost, 'push-ups', 30, 41);
    expect(win).toMatchObject({ valid: true, beat: true, margin: 4 });
    expect(win.next?.pace).toBeCloseTo(1.367, 3);
    const loss = judgeRun(ghost, 'push-ups', 30, 47.5);
    expect(loss).toMatchObject({ valid: true, beat: false, margin: -2.5 });
    expect(loss.next).toBeUndefined();
  });
  it('a time faster than humanly possible is neither a win nor a ghost', () => {
    expect(judgeRun(ghost, 'push-ups', 30, 5)).toEqual({ valid: false, beat: null, margin: 0 });
    expect(judgeRun(undefined, 'squats', 20, 2).next).toBeUndefined();
  });
  it('planks are not raced', () => {
    expect(canRaceGhost('plank')).toBe(false);
    expect(canRaceGhost('push-ups')).toBe(true);
  });
  it('formats race times', () => {
    expect(formatRace(41.2)).toBe('0:41.2');
    expect(formatRace(75)).toBe('1:15.0');
    expect(formatRace(9.04)).toBe('0:09.0');
  });
});
