import { describe, it, expect } from 'vitest';
import { deriveStreak, streakCaption, daysBetween, type StreakInput } from './streakFlame';

const TODAY = '2026-09-20';
const base: StreakInput = {
  today: TODAY,
  lastWorkoutDate: undefined,
  cachedStreak: 0,
  completedWorkouts: 0,
  freezeAvailable: false,
};
const on = (o: Partial<StreakInput>) => deriveStreak({ ...base, ...o });

describe('day arithmetic', () => {
  it('counts whole days, including across a month boundary', () => {
    expect(daysBetween('2026-09-20', '2026-09-20')).toBe(0);
    expect(daysBetween('2026-09-19', '2026-09-20')).toBe(1);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-09-13', '2026-09-20')).toBe(7);
  });
});

describe('the flame', () => {
  it('is unlit for somebody who has never trained', () => {
    const v = on({});
    expect(v.flameState).toBe('unlit');
    expect(v.streak).toBe(0);
    expect(v.atRisk).toBe(false);
    expect(streakCaption(v)).toBe('Finish your first workout');
  });

  it('blazes on a day the workout is done', () => {
    const v = on({ lastWorkoutDate: TODAY, cachedStreak: 5, completedWorkouts: 12 });
    expect(v.flameState).toBe('blazing');
    expect(v.streak).toBe(5);
    expect(v.workedOutToday).toBe(true);
    // Nothing to warn about — today is already done.
    expect(v.atRisk).toBe(false);
  });

  it('flickers when the streak is alive but today is not done yet', () => {
    const v = on({ lastWorkoutDate: '2026-09-19', cachedStreak: 5, completedWorkouts: 12 });
    expect(v.flameState).toBe('flickering');
    expect(v.streak).toBe(5);
    expect(v.atRisk).toBe(true);
    expect(streakCaption(v)).toBe('Train today to keep it');
  });

  it('goes out after two missed days with no freeze', () => {
    // Last trained on the 18th: the 19th was the grace day and it passed.
    const v = on({ lastWorkoutDate: '2026-09-18', cachedStreak: 5, completedWorkouts: 12 });
    expect(v.flameState).toBe('out');
    expect(v.streak).toBe(0);
    expect(streakCaption(v)).toBe('Start a new streak');
  });

  it('a freeze buys exactly one more day, and says so', () => {
    const missedTwo = { lastWorkoutDate: '2026-09-18', cachedStreak: 5, completedWorkouts: 12 };
    expect(on({ ...missedTwo, freezeAvailable: false }).flameState).toBe('out');

    const saved = on({ ...missedTwo, freezeAvailable: true });
    expect(saved.flameState).toBe('flickering');
    expect(saved.streak).toBe(5);
    expect(saved.savedByFreeze).toBe(true);
    expect(streakCaption(saved)).toBe('Freeze saved it — train today');
  });

  it('a freeze does not save a third missed day', () => {
    const v = on({ lastWorkoutDate: '2026-09-17', cachedStreak: 5, completedWorkouts: 12, freezeAvailable: true });
    expect(v.flameState).toBe('out');
    expect(v.streak).toBe(0);
  });

  it('never shows a lit flame on a stale cached streak', () => {
    // The whole reason this is derived from the date gap: statsCache.streak
    // is only written when a workout completes, so somebody who last
    // trained in March still has a 30 sitting in their profile.
    const v = on({ lastWorkoutDate: '2026-03-01', cachedStreak: 30, completedWorkouts: 200 });
    expect(v.flameState).toBe('out');
    expect(v.streak).toBe(0);
  });

  it('is out, not blazing, when the date matches but nothing was completed', () => {
    // lastWorkoutDate without a completed workout on the active program is
    // not a training day — it must not light the flame.
    const v = on({ lastWorkoutDate: TODAY, cachedStreak: 0, completedWorkouts: 0 });
    expect(v.workedOutToday).toBe(false);
    expect(v.flameState).toBe('out');
  });

  it('relights the moment a workout lands', () => {
    const before = on({ lastWorkoutDate: '2026-09-10', cachedStreak: 4, completedWorkouts: 9 });
    expect(before.flameState).toBe('out');
    // completeWorkout() writes today's date and a recomputed streak.
    const after = on({ lastWorkoutDate: TODAY, cachedStreak: 1, completedWorkouts: 10 });
    expect(after.flameState).toBe('blazing');
    expect(after.streak).toBe(1);
  });

  it('walks a full week of training without ever dropping', () => {
    for (let d = 14; d <= 20; d++) {
      const day = `2026-09-${d}`;
      const v = deriveStreak({ ...base, today: day, lastWorkoutDate: day, cachedStreak: d - 13, completedWorkouts: d - 13 });
      expect(v.flameState).toBe('blazing');
      expect(v.streak).toBe(d - 13);
    }
  });
});
