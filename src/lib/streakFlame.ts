/**
 * The streak flame, as a pure function.
 *
 * This lived inline in the dashboard component, which meant the one piece
 * of real jeopardy in the product — train today or the fire goes out — was
 * the only significant logic in the app with no test around it. It is the
 * thing most likely to be quietly wrong (it depends on dates, timezones,
 * a cached number and a freeze), and the thing users notice fastest when
 * it is: a flame that stays lit for someone who has not trained in a week
 * makes the whole mechanic worthless.
 *
 * The critical subtlety: `statsCache.streak` is only recomputed when a
 * workout is COMPLETED (see completeWorkout in actions.ts). There is no
 * nightly job decaying it, so the stored number stays frozen at its last
 * value for as long as someone stays away. Trusting it alone would show a
 * "7 day streak" to a person who last trained in March. So the real state
 * is derived from the day gap, and the cached number is only used once
 * that gap says the streak is still alive.
 */

export type FlameState =
  /** Never trained. An unlit ember inviting a first workout. */
  | 'unlit'
  /** Trained today. Full flame. */
  | 'blazing'
  /** Streak alive but today's session is still outstanding. */
  | 'flickering'
  /** Had a streak, left it too long. Out until a new one starts. */
  | 'out';

export interface StreakInput {
  /** Today in the viewer's timezone, 'YYYY-MM-DD'. */
  today: string;
  /** Last completed workout, 'YYYY-MM-DD'. Undefined = never trained. */
  lastWorkoutDate?: string;
  /** statsCache.streak — last computed at completion time, never decayed. */
  cachedStreak: number;
  /** Workouts completed on the active program. */
  completedWorkouts: number;
  /** An unspent freeze absorbs exactly one missed day. */
  freezeAvailable: boolean;
}

export interface StreakView {
  /** What to show. 0 once the streak is genuinely dead. */
  streak: number;
  flameState: FlameState;
  /** Alive, but today is not done yet — drives the urgency banner. */
  atRisk: boolean;
  /** Alive only because the freeze is absorbing yesterday's miss. */
  savedByFreeze: boolean;
  workedOutToday: boolean;
  /** Whole days between the last workout and today. Null = never trained. */
  daysSince: number | null;
}

/** Whole days between two 'YYYY-MM-DD' dates, timezone-free. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.round((b - a) / 86_400_000);
}

export function deriveStreak(input: StreakInput): StreakView {
  const { today, lastWorkoutDate, cachedStreak, completedWorkouts, freezeAvailable } = input;

  const neverWorkedOut = !lastWorkoutDate;
  const daysSince = lastWorkoutDate ? daysBetween(lastWorkoutDate, today) : null;
  const workedOutToday = completedWorkouts > 0 && lastWorkoutDate === today;

  // 0 days = trained today. 1 day = yesterday, still salvageable today —
  // this is the grace day, and it is why the threshold is 2 and not 1. A
  // freeze pushes it out by exactly one more, matching computeStreak's own
  // freeze handling in lib/events.ts; without mirroring it here a
  // server-side save would be invisible and the UI would call a live
  // streak dead.
  const deadAt = freezeAvailable ? 3 : 2;
  const broken = daysSince !== null && daysSince >= deadAt;
  const streak = broken ? 0 : cachedStreak;

  const flameState: FlameState = neverWorkedOut
    ? 'unlit'
    : workedOutToday
      ? 'blazing'
      : streak > 0
        ? 'flickering'
        : 'out';

  return {
    streak,
    flameState,
    atRisk: streak > 0 && !workedOutToday,
    savedByFreeze: daysSince === 2 && freezeAvailable && streak > 0,
    workedOutToday,
    daysSince,
  };
}

/**
 * The line under the flame. Phrased as the state of the fire, not as a
 * statistic — "Flickering — train today to keep it lit" is the mechanic
 * stated out loud, which is the entire reason the tile works.
 */
export const STREAK_CAPTION: Record<FlameState, string> = {
  unlit: 'Light it — finish your first workout',
  blazing: 'Blazing — keep it going',
  flickering: 'Flickering — train today to keep it lit',
  out: "Flame's out — start a new streak today",
};

export function streakCaption(view: StreakView): string {
  if (view.savedByFreeze) return '🧊 Freeze saved your streak — train today to keep it';
  return STREAK_CAPTION[view.flameState];
}
