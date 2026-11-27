import { describe, it, expect } from 'vitest';
import { combatStats, splitWorkout } from './combatStats';

const NOW = new Date('2026-11-27T12:00:00Z').getTime(), DAY = 86_400_000;
const lift = (daysAgo: number, sets = 10) => ({ completedAt: new Date(NOW - daysAgo * DAY), duration: 45, exercises: [{ name: 'Barbell Back Squat', sets: Array.from({ length: sets }, () => ({ weight: 100, reps: 5, completed: true })) }] });
const run = (daysAgo: number, minutes = 30) => ({ completedAt: new Date(NOW - daysAgo * DAY), duration: minutes, exercises: [{ name: 'Easy Run', sets: [{ weight: 0, reps: 1, completed: true }] }] });

describe('combat stats', () => {
  it('splits a workout into strength sets and cardio minutes', () => {
    expect(splitWorkout(lift(0, 12))).toEqual({ strengthSets: 12, cardioMinutes: 0 });
    expect(splitWorkout(run(0, 30))).toEqual({ strengthSets: 0, cardioMinutes: 30 });
    const mixed = { completedAt: new Date(NOW), duration: 60, exercises: [...lift(0, 8).exercises, ...run(0).exercises] };
    expect(splitWorkout(mixed)).toEqual({ strengthSets: 8, cardioMinutes: 30 });
    expect(splitWorkout({ completedAt: new Date(NOW), exercises: [{ name: 'Squat', sets: [{ completed: false }] }] })).toEqual({ strengthSets: 0, cardioMinutes: 0 });
  });
  it('is zero with no training', () => {
    const s = combatStats([], NOW);
    expect([s.strength.value, s.cardio.value, s.discipline.value]).toEqual([0, 0, 0]);
    expect(s.daysSinceLast).toBeNull(); expect(s.fading).toBe(false);
  });
  it('reaches 100 for a steady month at the full amount', () => {
    const month = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 25, 26].map((d) => lift(d, 10)); // 4 a week, 40 sets a week
    const s = combatStats(month, NOW, 4);
    expect(s.strength.value).toBe(100); expect(s.discipline.value).toBe(100); expect(s.cardio.value).toBe(0);
  });
  it('rises when you train and fades when you stop', () => {
    const trained = [0, 2, 4, 5].map((d) => lift(d, 10));
    const fresh = combatStats(trained, NOW, 4);
    expect(fresh.strength.value).toBe(40); expect(fresh.strength.change).toBeGreaterThan(0); expect(fresh.fading).toBe(false);
    const later = combatStats(trained, NOW + 10 * DAY, 4); // ten days with nothing
    expect(later.strength.value).toBeLessThan(fresh.strength.value);
    expect(later.strength.change).toBeLessThan(0); expect(later.fading).toBe(true); expect(later.daysSinceLast).toBe(10);
    expect(combatStats(trained, NOW + 40 * DAY, 4).strength.value).toBe(0);
  });
  it('scores cardio from minutes and counts a day once for discipline', () => {
    const s = combatStats([run(0, 45), run(0, 45), run(1, 0)], NOW, 2);
    expect(s.cardio.value).toBe(40);        // 90 of 225 weighted minutes
    expect(s.discipline.value).toBe(40);    // 2 days of 5 weighted days
  });
});
