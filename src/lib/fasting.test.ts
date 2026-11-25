import { describe, it, expect } from 'vitest';
import { suggestPlan, stageAt, addToLog, weekBars, weekStart, formatHMS, toHHMM, toMinutes } from './fasting';

describe('fasting', () => {
  it('suggests one step beyond what they already do, capped at 16:8', () => {
    expect(suggestPlan('08:00', '21:00').id).toBe('14:10'); // 11h overnight already
    expect(suggestPlan('07:00', '22:00').id).toBe('12:12');
    expect(suggestPlan('12:00', '20:00').id).toBe('16:8');  // already 16h: stay
    expect(suggestPlan('13:00', '19:00').id).toBe('16:8');  // never above 16:8
  });
  it('picks the stage for the hours fasted', () => {
    expect(stageAt(0).id).toBe('fed');
    expect(stageAt(4).id).toBe('settle');
    expect(stageAt(13.5).id).toBe('burn');
    expect(stageAt(30).id).toBe('repair');
  });
  it('logs real fasts only, newest first', () => {
    const h = 3_600_000;
    let log = addToLog([], { start: 0, end: 10 * 60_000, goalHours: 16 });
    expect(log).toEqual([]);
    log = addToLog(log, { start: 0, end: 16 * h, goalHours: 16 });
    log = addToLog(log, { start: 24 * h, end: 38 * h, goalHours: 16 });
    expect(log.map((e) => e.end / h)).toEqual([38, 16]);
  });
  it('builds the week from the day each fast ended', () => {
    const mon = weekStart(new Date(2026, 10, 25)); // Wed 25 Nov 2026
    expect(mon.getDay()).toBe(1);
    const h = 3_600_000, t = mon.getTime();
    const { hours, average } = weekBars([
      { start: t - 6 * h, end: t + 10 * h, goalHours: 16 },          // ends Monday: 16h
      { start: t + 42 * h, end: t + 56 * h, goalHours: 16 },         // ends Wednesday: 14h
      { start: t - 200 * h, end: t - 190 * h, goalHours: 16 },       // last week
    ], mon);
    expect(hours).toEqual([16, 0, 14, 0, 0, 0, 0]);
    expect(average).toBe(15);
  });
  it('formats times', () => {
    expect(formatHMS(3_723_000)).toBe('01:02:03');
    expect(toHHMM(toMinutes('18:30') + 16 * 60)).toBe('10:30');
  });
});
