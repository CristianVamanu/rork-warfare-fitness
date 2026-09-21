/**
 * Where a member is inside their program's week — the "This week" bars
 * under the flame.
 *
 * A program week is daysPerWeek sessions long, so the position within it
 * is the session count wrapped by that length. The obvious expression,
 * `completed % daysPerWeek`, has one wrong answer: it returns 0 the moment
 * the LAST session of a week is logged. A member finishing session 6 of 6
 * walked out of the gym, opened Home, and saw "0/6" with every bar dark.
 * At the end of a program — always a whole number of weeks — "Complete"
 * sat beside an empty strip.
 *
 * So a full week stays full. The bars only advance again when the next
 * week's first session lands (7th session → 1/6), and only ever read 0
 * before the very first session. That is what "this week" means to the
 * person looking at it: the row fills as they train, and it does not
 * wipe itself the moment they earn the last bar.
 *
 * Pure and tested, because the previous version was derived inline in the
 * dashboard where nothing could assert it — the same way the flame and the
 * old rolling-seven-day bars went quietly wrong before.
 */
export function sessionsIntoWeek(completedWorkouts: number, daysPerWeek: number): number {
  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 1) return 0;
  const completed = Math.max(0, Math.floor(completedWorkouts || 0));
  if (completed === 0) return 0;
  const rem = completed % daysPerWeek;
  return rem === 0 ? daysPerWeek : rem;
}
