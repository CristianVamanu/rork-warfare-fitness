/**
 * Smart weight suggestions: what to lift on each set today, from the
 * member's last two sessions of the same exercise. Double progression, the
 * standard coaching method:
 *
 *  - Every set hit the target reps last time  → add weight.
 *  - Close (within 2 reps on average)          → same weight, beat last time's reps.
 *  - Well short twice in a row at that weight  → drop about 10% and build back.
 *  - Recovery (lighter) session                → never add weight.
 *
 * Increments follow the kit: big lower-body lifts jump more than presses,
 * dumbbell and isolation work jumps least. Results are rounded to what you
 * can actually load. Pure functions, unit-tested.
 */
export type Unit = 'kg' | 'lbs';
export interface DoneSet { weight: number; reps: number }

export interface Suggestion {
  weight: number;
  reps: number;
  /** One short line shown with the suggestion. */
  reason: string;
  kind: 'increase' | 'repeat' | 'deload' | 'hold';
  lastWeight: number;
  lastReps: number;
}

const LOWER = /squat|deadlift|leg press|hip thrust|rdl|romanian|good morning|lunge|split squat|hack/i;
const SMALL = /dumbbell|\bdb\b|curl|raise|fly|flye|extension|kickback|pullover|shrug|calf|face pull|cable|machine/i;

/** Weight step for one jump. */
export function increment(name: string, unit: Unit): number {
  if (SMALL.test(name) && !LOWER.test(name)) return unit === 'lbs' ? 5 : 2;
  if (LOWER.test(name)) return unit === 'lbs' ? 10 : 5;
  return unit === 'lbs' ? 5 : 2.5;
}

/** Nearest loadable weight (barbell plates or dumbbell steps). */
export function roundLoad(w: number, name: string, unit: Unit): number {
  const step = SMALL.test(name) && !LOWER.test(name) ? (unit === 'lbs' ? 5 : 2) : (unit === 'lbs' ? 5 : 2.5);
  return Math.max(0, Math.round(w / step) * step);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * @param sessions completed working sets per past session, newest first
 *                 (only sets with weight > 0).
 */
export function suggest(
  name: string,
  targetReps: number,
  sessions: DoneSet[][],
  unit: Unit,
  opts: { recovery?: boolean } = {},
): Suggestion | null {
  const last = sessions.find((s) => s.length > 0);
  if (!last || !(targetReps > 0)) return null;
  const u = unit === 'lbs' ? 'lb' : 'kg';

  // The working weight is the heaviest one used; judge the sets done at it.
  const top = Math.max(...last.map((s) => s.weight));
  const atTop = last.filter((s) => s.weight === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const avgReps = atTop.reduce((a, s) => a + s.reps, 0) / atTop.length;
  const base = { lastWeight: top, lastReps: minReps };

  if (opts.recovery) {
    return { ...base, weight: top, reps: targetReps, kind: 'hold', reason: `Recovery day: stay at ${fmt(top)} ${u}, no jump today.` };
  }

  if (minReps >= targetReps) {
    const w = roundLoad(top + increment(name, unit), name, unit);
    return { ...base, weight: w, reps: targetReps, kind: 'increase', reason: `All sets hit ${targetReps}+ reps last time. Add ${fmt(w - top)} ${u}.` };
  }

  // Stalled: well short last time AND the session before at the same weight.
  const prev = sessions.slice(sessions.indexOf(last) + 1).find((s) => s.length > 0);
  const prevShort = !!prev && Math.max(...prev.map((s) => s.weight)) === top
    && Math.min(...prev.filter((s) => s.weight === top).map((s) => s.reps)) < targetReps;
  if (avgReps < targetReps - 2 && prevShort) {
    const w = roundLoad(top * 0.9, name, unit);
    return { ...base, weight: w, reps: targetReps, kind: 'deload', reason: `Stuck at ${fmt(top)} ${u} two sessions running. Drop to ${fmt(w)} ${u} and build back up.` };
  }

  const aim = Math.min(targetReps, minReps + 1);
  return { ...base, weight: top, reps: aim, kind: 'repeat', reason: `Same weight. Beat last time: aim for ${aim} reps on every set.` };
}
