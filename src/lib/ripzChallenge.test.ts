import { describe, it, expect } from 'vitest';
import { rangeForDay, rollChallengeDay, challengeView, challengeBadges, ripzReminder, CHALLENGE_DAYS, type ChallengeRecord } from './ripzChallenge';

function seeded(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const done = (ds: number[]) => Object.fromEntries(ds.map((d) => [String(d), { count: 50, move: 'Push-ups', date: 'x' }]));

describe('30-day ripz challenge', () => {
  it('ramps up, and never eases off', () => {
    let prev = rangeForDay(1);
    expect(prev).toEqual({ min: 30, max: 80 });
    for (let d = 2; d <= CHALLENGE_DAYS; d++) { const r = rangeForDay(d); expect(r.min).toBeGreaterThanOrEqual(prev.min); expect(r.max).toBeGreaterThanOrEqual(prev.max); prev = r; }
    expect(rangeForDay(30)).toEqual({ min: 200, max: 250 });
  });
  it('deals inside the day range, in fives, and the retry never repeats the first number', () => {
    const rng = seeded(4);
    for (let d = 1; d <= CHALLENGE_DAYS; d++) for (let i = 0; i < 200; i++) {
      const first = rollChallengeDay(d, 'push-ups', null, rng); const retry = rollChallengeDay(d, 'push-ups', first.count, rng);
      const { min, max } = rangeForDay(d);
      for (const c of [first, retry]) { expect(c.count).toBeGreaterThanOrEqual(min); expect(c.count).toBeLessThanOrEqual(max); expect(c.count % 5).toBe(0); expect(c.move.id).toBe('push-ups'); }
      expect(retry.count).not.toBe(first.count);
    }
  });
  it('the retry can go higher or lower', () => {
    const rng = seeded(9); let up = 0; let down = 0;
    for (let i = 0; i < 400; i++) { const a = rollChallengeDay(10, null, null, rng); const b = rollChallengeDay(10, a.move.id, a.count, rng); if (b.count > a.count) up++; else down++; }
    expect(up).toBeGreaterThan(80); expect(down).toBeGreaterThan(80);
  });
  it('follows the calendar and counts a day once', () => {
    const rec: ChallengeRecord = { startedAt: '2026-11-01', days: done([1, 2]) };
    const v = challengeView(rec, '2026-11-03');
    expect(v).toMatchObject({ state: 'active', day: 3, doneToday: false, doneCount: 2, missed: 0, passesLeft: 3, totalReps: 100 });
    expect(v.grid.slice(0, 4)).toEqual(['done', 'done', 'today', 'ahead']);
    expect(challengeView({ ...rec, days: done([1, 2, 3]) }, '2026-11-03').doneToday).toBe(true);
    expect(challengeView(null, '2026-11-03').state).toBe('none');
    expect(challengeView({ startedAt: '2026-11-10' }, '2026-11-03').state).toBe('none');
  });
  it('forgives three missed days and ends on the fourth', () => {
    expect(challengeView({ startedAt: '2026-11-01', days: done([1]) }, '2026-11-05')).toMatchObject({ state: 'active', missed: 3, passesLeft: 0, day: 5 });
    expect(challengeView({ startedAt: '2026-11-01', days: done([1]) }, '2026-11-06')).toMatchObject({ state: 'failed', missed: 4 });
  });
  it('completes on day 30, across a month boundary, with passes used', () => {
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(challengeView({ startedAt: '2026-11-15', days: done(all) }, '2026-12-14')).toMatchObject({ state: 'complete', day: 30, doneCount: 30, missed: 0 });
    expect(challengeView({ startedAt: '2026-11-15', days: done(all.filter((d) => ![4, 9, 20].includes(d))) }, '2026-12-14').state).toBe('complete');
    // Day 30 itself missed, calendar over: still complete if the misses are within the passes.
    expect(challengeView({ startedAt: '2026-11-15', days: done(all.filter((d) => d !== 30)) }, '2026-12-16').state).toBe('complete');
    expect(challengeView({ startedAt: '2026-11-15', days: done(all.filter((d) => d > 4)) }, '2026-12-14').state).toBe('failed');
  });
  it('awards the week badge at 7 days and the finish badge on completion, and keeps it after a restart', () => {
    expect(challengeBadges({ startedAt: '2026-11-01', days: done([1, 2, 3, 4, 5, 6]) }, '2026-11-07')).toEqual([]);
    expect(challengeBadges({ startedAt: '2026-11-01', days: done([1, 2, 3, 4, 5, 6, 7]) }, '2026-11-07')).toEqual(['ripz_7']);
    expect(challengeBadges({ startedAt: '2026-11-15', days: done(Array.from({ length: 30 }, (_, i) => i + 1)) }, '2026-12-14')).toEqual(['ripz_7', 'ripz_30']);
    expect(challengeBadges({ startedAt: '2026-12-20', days: {}, completed: 1 }, '2026-12-20')).toEqual(['ripz_30']);
    expect(challengeBadges(null, '2026-12-20')).toEqual([]);
  });
  it('reminds once, in the evening, only while today is still open', () => {
    const rec: ChallengeRecord = { startedAt: '2026-11-01', days: done([1, 2]) };
    const at = (o: Partial<Parameters<typeof ripzReminder>[0]>) => ripzReminder({ rec, today: '2026-11-03', localHour: 18, ...o });
    expect(at({})?.title).toBe('Day 3 of 30: your pack is waiting');
    expect(at({ localHour: 17 })).toBeNull();
    expect(at({ lastSent: '2026-11-03' })).toBeNull();
    expect(at({ lastSent: '2026-11-02' })).not.toBeNull();
    expect(at({ rec: { ...rec, days: done([1, 2, 3]) } })).toBeNull();
    expect(at({ rec: null })).toBeNull();
    expect(at({ today: '2026-11-20' })).toBeNull(); // failed long ago
    expect(at({ rec: { ...rec, pending: { day: 3, packId: 'gold', moveId: 'push-ups', move: 'Push-ups', count: 60, rips: 1 } } })?.title).toBe('Day 3: 60 push-ups to log');
    expect(ripzReminder({ rec: { startedAt: '2026-11-01', days: done([1]) }, today: '2026-11-05', localHour: 18 })?.title).toBe('Day 5: no rest passes left');
    expect(ripzReminder({ rec: { startedAt: '2026-11-01', days: done(Array.from({ length: 29 }, (_, i) => i + 1)) }, today: '2026-11-30', localHour: 18 })?.title).toBe('Day 30. The last pack.');
  });
});

describe('challenge levels', () => {
  it('beginner days are small and still ramp; advanced is unchanged', () => {
    expect(rangeForDay(1, 'beginner')).toEqual({ min: 10, max: 20 });
    expect(rangeForDay(30, 'beginner')).toEqual({ min: 50, max: 65 });
    expect(rangeForDay(1, 'advanced')).toEqual({ min: 30, max: 80 });
    for (let d = 1; d <= CHALLENGE_DAYS; d++) for (let i = 0; i < 40; i++) {
      const c = rollChallengeDay(d, 'push-ups', null, Math.random, 'beginner');
      const r = rangeForDay(d, 'beginner');
      expect(c.count).toBeGreaterThanOrEqual(r.min); expect(c.count).toBeLessThanOrEqual(r.max);
    }
  });
  it('a record uses the level it started at; old records stay advanced', () => {
    expect(challengeView({ startedAt: '2026-11-01', level: 'beginner' }, '2026-11-01').range).toEqual({ min: 10, max: 20 });
    expect(challengeView({ startedAt: '2026-11-01' }, '2026-11-01').range).toEqual({ min: 30, max: 80 });
  });
  it('a record with no start date is not in a challenge (after leaving)', () => {
    expect(challengeView({ completed: 1 } as unknown as ChallengeRecord, '2026-11-01').state).toBe('none');
  });
});
