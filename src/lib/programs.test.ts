import { describe, it, expect } from 'vitest';
import { getNextSession, getLastTrainingSlotIndex, countTrainingSlotsThrough, getTotalTrainingDays, pickBestProgram, MOCK_PROGRAMS } from './programs';
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

describe('getNextSession — rest days are shown, then explicitly skipped', () => {
  it('returns the next training slot directly when it is not a rest day', () => {
    const s = getNextSession(standard, -1, undefined);
    expect(s).toMatchObject({ index: 0, isRestToday: false });
    expect(s!.nextTraining).toMatchObject({ index: 0 });
  });

  it('shows the rest day when it is next, regardless of when the user last trained', () => {
    for (const when of [todayStr(), yesterdayStr(), daysAgoStr(5), undefined]) {
      const s = getNextSession(standard, 1, when);
      expect(s, `lastWorkoutDate=${when}`).toMatchObject({ index: 2, isRestToday: true });
      expect(s!.day.isRest).toBe(true);
      expect(s!.nextTraining).toMatchObject({ index: 3 });
    }
  });

  it('after skipping the rest day (pointer on the rest slot) the next workout is offered', () => {
    const s = getNextSession(standard, 2, todayStr()); // pointer now ON the rest slot
    expect(s).toMatchObject({ index: 3, isRestToday: false });
  });

  it('consecutive rest slots are shown one at a time; nextTraining points past all of them', () => {
    const p = prog([train('A'), rest(), rest(), rest(), train('B'), rest(), rest()]);
    expect(getNextSession(p, 0)).toMatchObject({ index: 1, isRestToday: true, nextTraining: { index: 4 } });
    expect(getNextSession(p, 1)).toMatchObject({ index: 2, isRestToday: true, nextTraining: { index: 4 } });
    expect(getNextSession(p, 3)).toMatchObject({ index: 4, isRestToday: false });
  });

  it('alternating program: workout → rest shown → skip → workout, never stuck', () => {
    const alt = prog([train('A'), rest(), train('B'), rest(), train('C'), rest(), rest()]);
    expect(getNextSession(alt, 0)).toMatchObject({ index: 1, isRestToday: true });   // after A: rest shown
    expect(getNextSession(alt, 1)).toMatchObject({ index: 2, isRestToday: false });  // skipped: B offered
    expect(getNextSession(alt, 2)).toMatchObject({ index: 3, isRestToday: true });   // after B: rest shown
    expect(getNextSession(alt, 6)).toMatchObject({ index: 7, isRestToday: false });  // week wraps to A
  });

  it('all-rest schedule shows rest with no next training', () => {
    const allRest = prog([rest(), rest(), rest(), rest(), rest(), rest(), rest()]);
    const s = getNextSession(allRest, 0);
    expect(s!.isRestToday).toBe(true);
    expect(s!.nextTraining).toBeNull();
  });

  it('every seed program: from any slot there is always a nextTraining', () => {
    for (const p of MOCK_PROGRAMS) {
      for (let last = -1; last < 14; last++) {
        const s = getNextSession(p, last);
        expect(s, `${p.id} slot ${last}`).not.toBeNull();
        expect(s!.nextTraining, `${p.id} no training after slot ${last}`).not.toBeNull();
      }
    }
  });
});

describe('getLastTrainingSlotIndex — what "Repeat today" should open', () => {
  it('returns the slot itself when it is a training day', () => {
    expect(getLastTrainingSlotIndex(standard, 1)).toBe(1);
  });
  it('walks back past a skipped rest slot to the last real session', () => {
    expect(getLastTrainingSlotIndex(standard, 2)).toBe(1); // slot 2 is Rest
    expect(getLastTrainingSlotIndex(standard, 4)).toBe(3); // slot 4 is Rest
  });
  it('is null before anything has been trained', () => {
    expect(getLastTrainingSlotIndex(standard, -1)).toBeNull();
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
