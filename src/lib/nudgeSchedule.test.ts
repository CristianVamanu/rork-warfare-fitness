import { describe, it, expect } from 'vitest';
import {
  isNudgeDue, nudgeGapDays, daysBetween, nudgeCopy, MAX_NUDGES, NUDGE_GAPS_DAYS,
  isMissedToday, aiMotivationDue, AI_MOTIVATION_WEEKDAY,
} from './nudgeSchedule';

describe('nudge schedule — reminders back off instead of repeating daily', () => {
  it('the first reminder is always due when none has been sent', () => {
    expect(isNudgeDue(0, null)).toBe(true);
  });

  it('the reported bug: a second reminder the very next morning is NOT due', () => {
    // Sent yesterday (count 1), one day later — gap after the first is 2.
    expect(isNudgeDue(1, 1)).toBe(false);
    expect(isNudgeDue(1, 2)).toBe(true);
  });

  it('gaps grow 1, 2, 4, 7 and then hold at 7', () => {
    expect(nudgeGapDays(0)).toBe(1);
    expect(nudgeGapDays(1)).toBe(2);
    expect(nudgeGapDays(2)).toBe(4);
    expect(nudgeGapDays(3)).toBe(7);
    expect(nudgeGapDays(4)).toBe(7);
    expect(nudgeGapDays(50)).toBe(NUDGE_GAPS_DAYS[NUDGE_GAPS_DAYS.length - 1]);
  });

  it('stops entirely after MAX_NUDGES, however long it has been', () => {
    expect(isNudgeDue(MAX_NUDGES, 400)).toBe(false);
    expect(isNudgeDue(MAX_NUDGES + 3, null)).toBe(false);
  });

  it('a fortnight of silence produces four reminders, not fourteen', () => {
    // Simulate the daily 8am run for 14 days with no workout.
    let sent = 0;
    let lastSentDay: number | null = null;
    const sentOn: number[] = [];
    for (let day = 1; day <= 14; day++) {
      const since = lastSentDay === null ? null : day - lastSentDay;
      if (isNudgeDue(sent, since)) { sent++; lastSentDay = day; sentOn.push(day); }
    }
    expect(sentOn).toEqual([1, 3, 7, 14]);
  });

  it('daysBetween counts calendar days, not clock hours', () => {
    expect(daysBetween('2026-09-14', '2026-09-15')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
    // Across the October clock change — still whole days.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('isMissedToday — calendar days and rest days, not a 24-hour stopwatch', () => {
  const base = { today: '2026-09-15', yesterday: '2026-09-14', hasWorkoutEventInWindow: false, nextSlotIsRest: false };

  it('trained yesterday morning → not missed at 8am today (the 25-hour false positive)', () => {
    expect(isMissedToday({ ...base, lastWorkoutDate: '2026-09-14' })).toBe(false);
  });

  it('trained two days ago, training day due → missed', () => {
    expect(isMissedToday({ ...base, lastWorkoutDate: '2026-09-13' })).toBe(true);
  });

  it('rest day due today → never missed, however long since the last workout', () => {
    expect(isMissedToday({ ...base, lastWorkoutDate: '2026-09-01', nextSlotIsRest: true })).toBe(false);
  });

  it('an event inside the window wins even with no lastWorkoutDate on the account', () => {
    expect(isMissedToday({ ...base, lastWorkoutDate: undefined, hasWorkoutEventInWindow: true })).toBe(false);
  });

  it('no date, no event, training due → missed', () => {
    expect(isMissedToday({ ...base, lastWorkoutDate: undefined })).toBe(true);
  });
});

describe('aiMotivationDue — the admin schedule is actually honoured', () => {
  it('daily sends any day', () => {
    for (let d = 0; d < 7; d++) expect(aiMotivationDue('daily', d)).toBe(true);
  });

  it('weekly sends on Wednesday only, and not on the Sunday recap day', () => {
    expect(aiMotivationDue('weekly', AI_MOTIVATION_WEEKDAY)).toBe(true);
    expect(aiMotivationDue('weekly', 0)).toBe(false);
    expect(aiMotivationDue('weekly', 1)).toBe(false);
  });

  it('unset behaves as daily (pre-existing configs), and force overrides weekly', () => {
    expect(aiMotivationDue(undefined, 5)).toBe(true);
    expect(aiMotivationDue('weekly', 5, true)).toBe(true);
  });
});

describe('nudge copy — never the same message twice, never a label with a colon', () => {
  const base = { daysSinceWorkout: 3, totalWorkouts: 12, identity: 'People building muscle', programName: 'Alpha Bulk' };

  it('varies by how many have been sent', () => {
    const bodies = new Set([0, 1, 2, 3].map((n) => nudgeCopy({ ...base, nudgesSent: n }).body));
    expect(bodies.size).toBe(4);
  });

  it('never opens with "Identity:" — the segment-label leak from the screenshot', () => {
    for (let n = 0; n < 6; n++) {
      const { title, body } = nudgeCopy({ ...base, nudgesSent: n });
      expect(body.startsWith('People building muscle:')).toBe(false);
      expect(title.startsWith('People building muscle:')).toBe(false);
    }
  });

  it('does not claim "today" at 8am — the first reminder talks about yesterday', () => {
    const { title, body } = nudgeCopy({ ...base, nudgesSent: 0, daysSinceWorkout: 1 });
    expect(`${title} ${body}`.toLowerCase()).not.toContain("haven't logged a workout today");
  });

  it('names the program every time and the day count when it is known', () => {
    const { body } = nudgeCopy({ ...base, nudgesSent: 3, daysSinceWorkout: 9 });
    expect(body).toContain('Alpha Bulk');
    expect(body).toContain('9 days');
  });

  it('copes with no known last-workout date', () => {
    const { body } = nudgeCopy({ ...base, nudgesSent: 1, daysSinceWorkout: null });
    expect(body).toContain('Alpha Bulk');
    expect(body).not.toContain('null');
    expect(body).not.toContain('NaN');
  });
});
