import { describe, it, expect } from 'vitest';
import { buildReport, type Member, type Activity } from './retention';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 30, 12);

describe('buildReport', () => {
  const signup = NOW - 50 * DAY;
  const members: Member[] = [
    { uid: 'a', signedUpAt: signup, paid: true, programId: 'p1', programName: 'Warpath', completedWorkouts: 10, totalWorkouts: 12 },
    { uid: 'b', signedUpAt: signup, paid: false, programId: 'p1', programName: 'Warpath', completedWorkouts: 1, totalWorkouts: 12 },
    { uid: 'c', signedUpAt: NOW - 1 * DAY, paid: false }, // too new for any measure
  ];
  const act: Activity[] = [
    { uid: 'a', at: signup + 1.5 * DAY, type: 'WORKOUT_COMPLETED' },
    { uid: 'a', at: signup + 2 * DAY + 3600_000, type: 'WORKOUT_COMPLETED' },
    { uid: 'a', at: signup + 4 * DAY, type: 'WORKOUT_COMPLETED' },
    { uid: 'a', at: signup + 8 * DAY, type: 'MEAL_LOGGED' },
    { uid: 'a', at: signup + 31 * DAY, type: 'WORKOUT_COMPLETED' },
    { uid: 'a', at: NOW - 3600_000, type: 'WORKOUT_COMPLETED' },
    { uid: 'b', at: signup + 0.5 * DAY, type: 'WORKOUT_COMPLETED' },
  ];

  it('measures retention only on members old enough', () => {
    const r = buildReport(members, act, NOW, 8);
    expect(r.overall.d1).toMatchObject({ n: 1, of: 2, pct: 50 });
    expect(r.overall.d7).toMatchObject({ n: 1, of: 2 });
    expect(r.overall.d30).toMatchObject({ n: 1, of: 2 });
    expect(r.overall.firstWorkout).toMatchObject({ n: 2, of: 2 });
    expect(r.overall.firstWeek).toMatchObject({ n: 1, of: 2 });
    expect(r.overall.paid).toMatchObject({ n: 1, of: 3 });
  });

  it('counts active users and program progress', () => {
    const r = buildReport(members, act, NOW, 8);
    expect(r.totals).toMatchObject({ members: 3, dau: 1, wau: 1, mau: 1 });
    expect(r.programs[0]).toMatchObject({ programId: 'p1', enrolled: 2, stalled: 1 });
    expect(r.programs[0].finishedHalf).toMatchObject({ n: 1, of: 2 });
  });

  it('groups signups into weekly cohorts, newest first', () => {
    const r = buildReport(members, act, NOW, 8);
    expect(r.cohorts.length).toBe(2);
    expect(r.cohorts[0].week > r.cohorts[1].week).toBe(true);
    expect(r.cohorts[0].d1.pct).toBeNull();
  });
});
