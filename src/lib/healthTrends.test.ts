import { describe, it, expect } from 'vitest';
import { readiness, brief, lastDays, series, mean, fmtMinutes, type DayMap } from './healthTrends';

const NOW = new Date(2026, 10, 3, 9, 0);
const build = (n: number, f: (i: number) => Partial<{ sleepMinutes: number; restingHeartRate: number }>, today?: Partial<{ sleepMinutes: number; restingHeartRate: number }>): DayMap => {
  const dates = lastDays(15, NOW);
  const m: DayMap = new Map();
  dates.slice(0, -1).slice(-n).forEach((d, i) => m.set(d, { date: d, source: 'healthconnect', ...f(i) }));
  if (today) m.set(dates[14], { date: dates[14], source: 'healthconnect', ...today });
  return m;
};

describe('healthTrends', () => {
  it('lastDays ends today, oldest first', () => {
    const d = lastDays(3, NOW);
    expect(d).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('series and mean skip gaps', () => {
    const m = build(3, () => ({ sleepMinutes: 420 }));
    const s = series(m, lastDays(15, NOW), 'sleepMinutes');
    expect(s.filter(v => v != null)).toHaveLength(3);
    expect(mean(s)).toBe(420);
    expect(mean([null, null], 1)).toBeNull();
  });

  it('needs a baseline before scoring', () => {
    const r = readiness(build(2, () => ({ sleepMinutes: 420, restingHeartRate: 58 }), { sleepMinutes: 300, restingHeartRate: 64 }), NOW);
    expect(r.score).toBeNull();
    expect(r.baselineDays).toBe(2);
    expect(brief(r)).toMatch(/2 of 4 nights/);
  });

  it('a short night and raised resting HR lowers the score', () => {
    const r = readiness(build(10, () => ({ sleepMinutes: 430, restingHeartRate: 57 }), { sleepMinutes: 340, restingHeartRate: 62 }), NOW);
    expect(r.sleepDelta).toBe(-90);
    expect(r.rhrDelta).toBe(5);
    expect(r.level).toBe('low');
    expect(brief(r)).toMatch(/1h 30m under your usual.*\+5 bpm.*easier session/);
  });

  it('a normal day scores normal and an extra-good one high', () => {
    expect(readiness(build(10, () => ({ sleepMinutes: 430, restingHeartRate: 57 }), { sleepMinutes: 430, restingHeartRate: 57 }), NOW).level).toBe('normal');
    expect(readiness(build(10, () => ({ sleepMinutes: 420, restingHeartRate: 60 }), { sleepMinutes: 480, restingHeartRate: 56 }), NOW).level).toBe('high');
  });

  it('score stays within 0-100', () => {
    const r = readiness(build(10, () => ({ sleepMinutes: 480, restingHeartRate: 50 }), { sleepMinutes: 60, restingHeartRate: 90 }), NOW);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(25);
    expect(r.level).toBe('low');
  });

  it('formats minutes', () => {
    expect(fmtMinutes(-90)).toBe('1h 30m');
    expect(fmtMinutes(45)).toBe('45m');
  });
});

describe('readiness fallbacks', () => {
  const NOW2 = new Date(2026, 10, 3, 9, 0);
  const mk = (prior: Partial<Record<string, number>>, today: Partial<Record<string, number>>) => {
    const dates = lastDays(15, NOW2);
    const m: DayMap = new Map();
    dates.slice(0, -1).forEach(d => m.set(d, { date: d, source: 'healthconnect', ...prior }));
    m.set(dates[14], { date: dates[14], source: 'healthconnect', ...today });
    return m;
  };
  it('uses the lowest heart rate when the watch writes no resting HR', () => {
    const r = readiness(mk({ sleepMinutes: 420, minHeartRate: 50 }, { sleepMinutes: 420, minHeartRate: 56 }), NOW2);
    expect(r.hrSource).toBe('lowest');
    expect(r.rhrDelta).toBe(6);
    expect(r.level).toBe('low');
    expect(brief(r)).toMatch(/Lowest HR \+6 bpm/);
  });
  it('counts a clear HRV drop against readiness', () => {
    const base = readiness(mk({ sleepMinutes: 420, hrvMs: 60 }, { sleepMinutes: 420, hrvMs: 60 }), NOW2).score!;
    const low = readiness(mk({ sleepMinutes: 420, hrvMs: 60 }, { sleepMinutes: 420, hrvMs: 36 }), NOW2);
    expect(low.hrvDeltaPct).toBe(-40);
    expect(low.score!).toBeLessThan(base - 10);
  });
});
