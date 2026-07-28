import { describe, it, expect } from 'vitest';
import { getNextSession, countTrainingSlotsThrough, getTotalTrainingDays, pickBestProgram, MOCK_PROGRAMS } from './programs';
import type { Program, ProgramDay } from '@/types';

const train = (label: string): ProgramDay => ({ label, isRest: false, exercises: [{ id: 'e', name: 'Squat', sets: 3, reps: 10, restSeconds: 60 }] });
const rest = (): ProgramDay => ({ label: 'Rest', isRest: true, exercises: [] });

// train, train, REST, train, REST, train, REST — same shape as most seed programs
const prog = (schedule: ProgramDay[], weeks = 4): Program => ({
  id: 't', name: 'T', description: '', level: 'beginner', goal: 'general',
  weeks, daysPerWeek: schedule.filter((d) => !d.isRest).length,
  exercises: [], schedule, createdBy: 'test', isPublic: true,
});
const standard = prog([train('A'), train('B'), rest(), train('C'), rest(), train('D'), rest()]);

const todayStr = () => new Date().toLocaleDateString('sv-SE');
const yesterdayStr = () => new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE');
const daysAgoStr = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE');

describe('getNextSession — rest-day deadlock fix', () => {
  it('returns the next training slot directly when it is not a rest day', () => {
    const s = getNextSession(standard, -1, undefined);
    expect(s).toMatchObject({ index: 0, isRestToday: false });
    expect(s!.day.label).toBe('A');
  });

  it('honors a rest day when the user trained yesterday', () => {
    // completed slot 1 (B) yesterday → slot 2 is rest → today IS the rest day
    const s = getNextSession(standard, 1, yesterdayStr());
    expect(s).toMatchObject({ index: 2, isRestToday: true });
    expect(s!.day.isRest).toBe(true);
  });

  it('honors a rest day when the user already trained today', () => {
    const s = getNextSession(standard, 1, todayStr());
    expect(s).toMatchObject({ index: 2, isRestToday: true });
  });

  it('skips a stale rest slot when the last workout was 2+ days ago (the deadlock case)', () => {
    const s = getNextSession(standard, 1, daysAgoStr(2));
    expect(s).toMatchObject({ index: 3, isRestToday: false });
    expect(s!.day.label).toBe('C');
  });

  it('skips consecutive stale rest slots', () => {
    // completed slot 5 (D) long ago → slot 6 rest, slot 7 wraps to week 2 slot 0 (A)
    const s = getNextSession(standard, 5, daysAgoStr(5));
    expect(s).toMatchObject({ index: 7, isRestToday: false });
    expect(s!.day.label).toBe('A');
  });

  it('never loops forever on an all-rest schedule; falls back to showing rest', () => {
    const allRest = prog([rest(), rest(), rest(), rest(), rest(), rest(), rest()]);
    const s = getNextSession(allRest, 0, daysAgoStr(10));
    expect(s!.isRestToday).toBe(true);
  });

  it('never deadlocks on any seed program: from any slot, a stale user always gets a workout', () => {
    for (const p of MOCK_PROGRAMS) {
      for (let last = -1; last < 14; last++) {
        const s = getNextSession(p, last, daysAgoStr(3));
        expect(s, `${p.id} stuck after slot ${last}`).not.toBeNull();
        expect(s!.isRestToday, `${p.id} rest-locked after slot ${last}`).toBe(false);
      }
    }
  });
});

describe('progress units — training days, not schedule slots', () => {
  it('countTrainingSlotsThrough excludes rest slots', () => {
    // slots 0..6 = A,B,rest,C,rest,D,rest → 4 training days in week 1
    expect(countTrainingSlotsThrough(standard, 6)).toBe(4);
    expect(countTrainingSlotsThrough(standard, 1)).toBe(2);
    expect(countTrainingSlotsThrough(standard, 2)).toBe(2); // rest slot adds nothing
    expect(countTrainingSlotsThrough(standard, -1)).toBe(0);
  });

  it('getTotalTrainingDays matches weeks × training-days-per-week for unphased programs', () => {
    expect(getTotalTrainingDays(standard)).toBe(4 * 4);
  });

  it('getTotalTrainingDays is phase-aware', () => {
    const phased: Program = {
      ...standard,
      weeks: 4,
      phases: [
        { id: 'p1', label: 'P1', startWeek: 1, endWeek: 2, schedule: standard.schedule! }, // 4 days/wk
        { id: 'p2', label: 'P2', startWeek: 3, endWeek: 4, schedule: [train('A'), train('B'), train('C'), train('D'), train('E'), rest(), rest()] }, // 5 days/wk
      ],
    };
    expect(getTotalTrainingDays(phased)).toBe(2 * 4 + 2 * 5);
  });

  it('every non-phased seed program totals weeks × daysPerWeek exactly', () => {
    // Phased programs (e.g. p15) deliberately vary training days per phase —
    // that's the whole point of getTotalTrainingDays being phase-aware (see
    // the test above) — so the top-level daysPerWeek × weeks equality only
    // holds for programs using one flat schedule throughout.
    for (const p of MOCK_PROGRAMS) {
      if (p.phases?.length) continue;
      expect(getTotalTrainingDays(p), p.id).toBe(p.weeks * p.daysPerWeek);
    }
  });
});

describe('pickBestProgram — weight-goal timeline scoring', () => {
  const goalMatch = (weeks: number, id: string): Program => ({
    ...standard, id, weeks, goal: 'weight-loss',
  });
  const pool: Program[] = [goalMatch(8, 'short'), goalMatch(24, 'medium'), goalMatch(52, 'long')];

  it('without a weeks-to-goal hint, ties are broken by goal/level/days only (first equally-good match wins)', () => {
    const result = pickBestProgram(pool, 'lose-fat', 'beginner', 4);
    expect(result!.id).toBe('short'); // all score equally on goal/level/days — first one wins the sort
  });

  it('prefers the program whose duration is closest to the estimated timeline', () => {
    const result = pickBestProgram(pool, 'lose-fat', 'beginner', 4, undefined, undefined, undefined, 24);
    expect(result!.id).toBe('medium');
  });

  it('a far-off duration match is never enough to beat a real goal-category mismatch', () => {
    // "wrong-goal" matches the 24-week timeline exactly but has the wrong
    // goal category — the 10-point goal-match bonus plus level match should
    // still make a same-goal program a better pick even at a worse duration.
    const wrongGoal: Program = { ...standard, id: 'wrong-goal', weeks: 24, goal: 'strength' };
    const rightGoalOffDuration: Program = { ...standard, id: 'right-goal', weeks: 8, goal: 'weight-loss' };
    const result = pickBestProgram([wrongGoal, rightGoalOffDuration], 'lose-fat', 'beginner', 4, undefined, undefined, undefined, 24);
    expect(result!.id).toBe('right-goal');
  });
});
