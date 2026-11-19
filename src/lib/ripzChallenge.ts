/**
 * The 30-day Ripz challenge: one pack a day for thirty days.
 *
 * Pure rules, no clock and no storage. The page passes in today's date and
 * the stored record; everything it shows is worked out here, so the tests
 * can pin each promise:
 *   - the reps ramp up week by week, and day 30 is a guaranteed big one;
 *   - two rips a day at most: the first, and one retry that may land higher
 *     or lower but never on the same number;
 *   - days follow the calendar from the start date. Three missed days are
 *     forgiven ("rest passes"); a fourth ends the challenge;
 *   - a day counts once, however often the page is opened.
 */
import { RIPZ_MOVES, tierFor, type RipzChallenge } from './ripz';

export const CHALLENGE_DAYS = 30;
export const REST_PASSES = 3;
export const RIPS_PER_DAY = 2;

/** Rep range for a challenge day (1-based), in fives. */
export function rangeForDay(day: number): { min: number; max: number } {
  if (day >= CHALLENGE_DAYS) return { min: 200, max: 250 };
  if (day <= 7) return { min: 30, max: 80 };
  if (day <= 14) return { min: 50, max: 120 };
  if (day <= 21) return { min: 80, max: 180 };
  return { min: 100, max: 250 };
}

/** One pack for a challenge day. `prevCount` is the first rip when this is the retry. */
export function rollChallengeDay(day: number, moveId: string | null, prevCount: number | null, rng: () => number = Math.random): RipzChallenge {
  const pick = <T,>(xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
  const move = (moveId && RIPZ_MOVES.find((m) => m.id === moveId)) || pick(RIPZ_MOVES);
  const { min, max } = rangeForDay(day);
  const all = Array.from({ length: (max - min) / 5 + 1 }, (_, i) => min + i * 5);
  const pool = prevCount == null ? all : all.filter((c) => c !== prevCount);
  const count = pick(pool);
  return { move, count, tier: tierFor(count) };
}

/** What is stored on the member's profile under `ripzChallenge`. */
export interface ChallengeRecord {
  /** Local calendar date the challenge began, 'YYYY-MM-DD'. Day 1. */
  startedAt: string;
  /** Finished days, keyed by day number. */
  days?: Record<string, { count: number; move: string; date: string }>;
  /** Today's pack once ripped, so a reload cannot deal a new one. */
  pending?: { day: number; packId: string; moveId: string; move: string; count: number; rips: number } | null;
  /** How many challenges this member has finished before this one. */
  completed?: number;
}

function dayNumber(startedAt: string, today: string): number {
  const a = Date.UTC(+startedAt.slice(0, 4), +startedAt.slice(5, 7) - 1, +startedAt.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

export type ChallengeState = 'none' | 'active' | 'failed' | 'complete';
export interface ChallengeView {
  state: ChallengeState;
  /** Today's day number, 1..30 (30 once past the end). */
  day: number;
  doneToday: boolean;
  doneCount: number;
  missed: number;
  passesLeft: number;
  totalReps: number;
  /** One entry per day 1..30. */
  grid: ('done' | 'missed' | 'today' | 'ahead')[];
  range: { min: number; max: number };
}

export function challengeView(rec: ChallengeRecord | null | undefined, today: string): ChallengeView {
  const empty: ChallengeView = { state: 'none', day: 1, doneToday: false, doneCount: 0, missed: 0, passesLeft: REST_PASSES, totalReps: 0, grid: Array(CHALLENGE_DAYS).fill('ahead'), range: rangeForDay(1) };
  if (!rec?.startedAt || !/^\d{4}-\d{2}-\d{2}$/.test(rec.startedAt)) return empty;
  const raw = dayNumber(rec.startedAt, today);
  if (raw < 1) return empty; // clock moved backwards: treat as not started
  const days = rec.days ?? {};
  const isDone = (d: number) => !!days[String(d)];
  const day = Math.min(CHALLENGE_DAYS, raw);
  const past = raw > CHALLENGE_DAYS;
  let missed = 0; let doneCount = 0; let totalReps = 0;
  const grid: ChallengeView['grid'] = [];
  for (let d = 1; d <= CHALLENGE_DAYS; d++) {
    if (isDone(d)) { doneCount++; totalReps += Number(days[String(d)].count) || 0; grid.push('done'); }
    else if (d < raw) { missed++; grid.push('missed'); }
    else if (d === raw) grid.push('today');
    else grid.push('ahead');
  }
  const doneToday = !past && isDone(day);
  // Finished: day 30 is done, or the calendar ran out, with the misses forgiven.
  const state: ChallengeState = missed > REST_PASSES ? 'failed' : (isDone(CHALLENGE_DAYS) || past) ? 'complete' : 'active';
  return { state, day, doneToday, doneCount, missed, passesLeft: Math.max(0, REST_PASSES - missed), totalReps, grid, range: rangeForDay(day) };
}
