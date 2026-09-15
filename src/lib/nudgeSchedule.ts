/**
 * When to send the next "you've stopped training" reminder, and what it says.
 *
 * The rule used to fire every day at 8am for anyone with a program and no
 * workout in the previous 24 hours — the only guard was "not already sent
 * today". A member who stopped got the identical message every morning,
 * forever. That is not a reminder, it is a reason to turn notifications off,
 * and every push after the third is a small vote for uninstalling.
 *
 * Reminders now back off. The gaps between them grow with each one sent
 * since the last workout, and the copy changes with the count so nothing
 * arrives twice. The count resets the moment a workout is logged, so a
 * member who comes back and lapses again starts gently again.
 *
 * Pure functions, no clock and no database: the caller passes the count and
 * the number of days since the previous reminder, which keeps the schedule
 * testable and keeps the route's Firestore reads exactly what they were.
 */

/**
 * Days that must pass after reminder N before reminder N+1 may send.
 * Index 0 is the wait before the FIRST reminder — one day, i.e. the first
 * missed morning — then two, four, and a week between each one after that.
 */
export const NUDGE_GAPS_DAYS = [1, 2, 4, 7] as const;

/** Reminders stop entirely after this many. Past it, silence is kinder than nagging. */
export const MAX_NUDGES = 8;

export function nudgeGapDays(nudgesSent: number): number {
  const n = Math.max(0, Math.floor(nudgesSent));
  return NUDGE_GAPS_DAYS[Math.min(n, NUDGE_GAPS_DAYS.length - 1)];
}

/**
 * Whether a reminder is due.
 *
 * `daysSinceLastNudge` is null when none has been sent since the last
 * workout, which is the first-reminder case and is always due (the caller
 * has already established there was no workout in the window).
 */
export function isNudgeDue(nudgesSent: number, daysSinceLastNudge: number | null): boolean {
  if (nudgesSent >= MAX_NUDGES) return false;
  if (daysSinceLastNudge === null) return true;
  return daysSinceLastNudge >= nudgeGapDays(nudgesSent);
}

/**
 * Whole days between two 'YYYY-MM-DD' strings (b - a). Both are treated as
 * dates, not instants, so the answer does not move with the server's clock.
 */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export interface NudgeCopyInput {
  /** How many reminders have already gone out since the last workout. */
  nudgesSent: number;
  /** Days since the last completed workout, if known. */
  daysSinceWorkout: number | null;
  /** Lifetime completed workouts, for the "don't waste it" line. */
  totalWorkouts: number;
  /** Identity phrase from the member's goal, e.g. "People building muscle". */
  identity: string;
  programName: string;
}

/**
 * The reminder text, varied by how many have gone before.
 *
 * Two things the old copy got wrong. It sent at 8am and said "you haven't
 * logged a workout today" — nobody has, at 8am. And it opened with the
 * identity phrase followed by a colon, "People building muscle: …", which
 * reads as a segment label leaking into the message rather than a sentence
 * addressed to a person. The identity now appears inside a sentence or not
 * at all.
 */
export function nudgeCopy(input: NudgeCopyInput): { title: string; body: string } {
  const { nudgesSent, daysSinceWorkout, totalWorkouts, identity, programName } = input;
  const days = daysSinceWorkout ?? null;
  const history = totalWorkouts >= 5 ? ` You've put in ${totalWorkouts} sessions — that's worth protecting.` : '';

  switch (nudgesSent) {
    case 0:
      return {
        title: 'Yesterday slipped. Today doesn\'t have to.',
        body: `${programName} is waiting. One session today and nothing is lost.${history}`,
      };
    case 1:
      return {
        title: `${identity} don't skip twice.`,
        body: days && days > 1
          ? `It's been ${days} days. Pick ${programName} back up today — the first one back is the hard one.`
          : `Pick ${programName} back up today — the first one back is the hard one.`,
      };
    case 2:
      return {
        title: 'A week is where it goes to die.',
        body: days && days > 1
          ? `${days} days off. Not a disaster yet. Open ${programName} and do the next session, however it feels.${history}`
          : `Open ${programName} and do the next session, however it feels.${history}`,
      };
    default:
      return {
        title: 'Still here when you are.',
        body: days && days > 1
          ? `${days} days since your last session. ${programName} picks up exactly where you left it — no catching up, no penalty.`
          : `${programName} picks up exactly where you left it — no catching up, no penalty.`,
      };
  }
}
