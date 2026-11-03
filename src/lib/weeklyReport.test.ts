import { describe, it, expect } from 'vitest';
import { reportWeek, computeWeekStats, rulesReport, parseReport, quietWeek } from './weeklyReport';

const at = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`).getTime();

describe('weeklyReport', () => {
  it('always covers the last complete week', () => {
    expect(reportWeek('2026-11-08')).toBe('2026-10-26'); // Sunday -> the week before
    expect(reportWeek('2026-11-09')).toBe('2026-11-02'); // Monday -> last week
    expect(reportWeek('2026-11-14')).toBe('2026-11-02'); // Saturday -> last week
  });

  it('computes the week from logged events and health days', () => {
    const sets = [{ completed: true }, { completed: true }, { completed: false }];
    const s = computeWeekStats('2026-11-02', [
      { type: 'WORKOUT_COMPLETED', at: at('2026-11-03'), payload: { duration: 50, totalWeightLifted: 4000, exercises: [{ sets }] } },
      { type: 'WORKOUT_COMPLETED', at: at('2026-11-05'), payload: { duration: 40, totalWeightLifted: 3000, exercises: [{ sets }] } },
      { type: 'WORKOUT_COMPLETED', at: at('2026-10-28'), payload: { duration: 40, totalWeightLifted: 5000, exercises: [] } },
      { type: 'MEAL_LOGGED', at: at('2026-11-03', 8), payload: { calories: 600, protein: 40 } },
      { type: 'MEAL_LOGGED', at: at('2026-11-03', 19), payload: { calories: 900, protein: 60 } },
      { type: 'MEAL_LOGGED', at: at('2026-11-04'), payload: { calories: 2000, protein: 120 } },
      { type: 'WEIGHT_RECORDED', at: at('2026-11-02'), payload: { weightKg: 82 } },
      { type: 'WEIGHT_RECORDED', at: at('2026-11-08'), payload: { weightKg: 81.4 } },
      { type: 'WORKOUT_COMPLETED', at: at('2026-11-09'), payload: { duration: 99 } }, // next week
    ], [{ date: '2026-11-03', sleepMinutes: 400, steps: 9000 }, { date: '2026-11-04', sleepMinutes: 440 }], { goals: { protein: 150 }, plannedPerWeek: 3 });
    expect(s).toMatchObject({ workouts: 2, prevWorkouts: 1, sets: 4, minutes: 90, volumeKg: 7000, prevVolumeKg: 5000 });
    expect(s).toMatchObject({ mealDays: 2, avgKcal: 1750, avgProtein: 110, weightStartKg: 82, weightEndKg: 81.4, avgSleepMin: 420, avgSteps: 9000 });
    expect(quietWeek(s)).toBe(false);
    const r = rulesReport(s);
    expect(r.fix).toMatch(/2 of 3 planned/);
    expect(r.targets).toHaveLength(3);
  });

  it('accepts only well-formed AI output', () => {
    expect(parseReport('{"headline":"Solid week","wins":["Two sessions"],"fix":"Train Friday","targets":["3 workouts","150 g protein","7h sleep"]}')).not.toBeNull();
    expect(parseReport('{"headline":"x","wins":[],"fix":"y","targets":["a","b"]}')).toBeNull();
    expect(parseReport('not json')).toBeNull();
  });
});
