// Combat stats: Strength, Cardio and Discipline, each 0 to 100.
//
// Worked out from the member's own logged workouts over the last four weeks,
// with recent weeks counting more than older ones. That weighting is the
// whole mechanic: train and a stat climbs; stop and the same sessions slide
// into the lower-weighted weeks, so the stat fades without any separate
// "decay" rule. Nothing here is a medical or performance measurement. It is
// a readable summary of how much, and how regularly, someone has trained.
import { isCardioName } from '@/lib/timedHold';

export interface StatWorkout {
  completedAt: unknown;
  duration?: number; // minutes
  exercises?: unknown[];
}
export interface CombatStat { value: number; change: number; }
export interface CombatStats {
  strength: CombatStat; cardio: CombatStat; discipline: CombatStat;
  /** Whole days since the last logged workout, or null with no workouts. */
  daysSinceLast: number | null;
  /** True when at least one stat is lower than it was a week ago. */
  fading: boolean;
}

const DAY = 86_400_000;
/** Weight of a workout by age in days: this week 1, then .75, .5, .25, then nothing. */
const weight = (ageDays: number) => (ageDays < 0 ? 0 : ageDays < 7 ? 1 : ageDays < 14 ? 0.75 : ageDays < 21 ? 0.5 : ageDays < 28 ? 0.25 : 0);
const STEADY = 2.5; // sum of the four weekly weights: a steady habit scores this many "weeks"

// What scores 100 when kept up every week for a month.
export const FULL = { strengthSetsPerWeek: 40, cardioMinutesPerWeek: 90 };

export function toMillis(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return null;
}

interface Split { strengthSets: number; cardioMinutes: number; }
/** Completed strength sets, and minutes spent on cardio, in one workout. */
export function splitWorkout(w: StatWorkout): Split {
  const exs = (Array.isArray(w.exercises) ? w.exercises : []) as { name?: string; sets?: { completed?: boolean }[] }[];
  let strengthSets = 0, cardioEx = 0, counted = 0;
  for (const ex of exs) {
    const done = (Array.isArray(ex.sets) ? ex.sets : []).filter((s) => s && s.completed !== false).length;
    if (done === 0) continue;
    counted++;
    if (isCardioName(ex.name)) cardioEx++;
    else strengthSets += done; // lifts, bodyweight work and holds all count as strength
  }
  // The log has no per-exercise time, so cardio minutes are the workout's
  // length shared out by how many of its exercises were cardio.
  const cardioMinutes = counted > 0 ? Math.max(0, w.duration ?? 0) * (cardioEx / counted) : 0;
  return { strengthSets, cardioMinutes };
}

function scoreAt(workouts: StatWorkout[], now: number, daysPerWeek: number) {
  let sets = 0, mins = 0; const days = new Map<string, number>();
  for (const w of workouts) {
    const t = toMillis(w.completedAt); if (t === null) continue;
    const k = weight((now - t) / DAY); if (k === 0) continue;
    const s = splitWorkout(w);
    sets += k * s.strengthSets; mins += k * s.cardioMinutes;
    const day = new Date(t).toISOString().slice(0, 10);
    days.set(day, Math.max(days.get(day) ?? 0, k)); // a day counts once, however many sessions
  }
  const dayScore = [...days.values()].reduce((a, b) => a + b, 0);
  const pct = (got: number, full: number) => Math.max(0, Math.min(100, Math.round((got / full) * 100)));
  return {
    strength: pct(sets, FULL.strengthSetsPerWeek * STEADY),
    cardio: pct(mins, FULL.cardioMinutesPerWeek * STEADY),
    discipline: pct(dayScore, Math.max(1, Math.min(7, daysPerWeek)) * STEADY),
  };
}

/** daysPerWeek: the member's planned training days (their program's), default 4. */
export function combatStats(workouts: StatWorkout[], now: Date | number = Date.now(), daysPerWeek = 4): CombatStats {
  const t = typeof now === 'number' ? now : now.getTime();
  const cur = scoreAt(workouts, t, daysPerWeek), prev = scoreAt(workouts, t - 7 * DAY, daysPerWeek);
  const times = workouts.map((w) => toMillis(w.completedAt)).filter((x): x is number => x !== null && x <= t);
  const last = times.length ? Math.max(...times) : null;
  const stat = (k: 'strength' | 'cardio' | 'discipline'): CombatStat => ({ value: cur[k], change: cur[k] - prev[k] });
  const s = { strength: stat('strength'), cardio: stat('cardio'), discipline: stat('discipline') };
  return { ...s, daysSinceLast: last === null ? null : Math.floor((t - last) / DAY), fading: s.strength.change < 0 || s.cardio.change < 0 || s.discipline.change < 0 };
}
