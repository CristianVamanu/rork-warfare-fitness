/**
 * The "lighter session" a member can choose on a low-readiness day. Only
 * the number of sets changes; exercises, reps, rest and the weight the
 * member enters stay the same, so the session is still the program's
 * session, just less volume. Cardio and HIIT entries are left alone (their
 * "sets" are intervals or a single block, and halving them changes the
 * workout's purpose).
 *
 * Applied only when the member explicitly accepts it (the session URL
 * carries ease=1); never automatic.
 */
export interface EasableExercise {
  sets: number;
  isHiit?: boolean;
  isCardio?: boolean;
  muscleGroup?: string;
  cardioDurationSeconds?: number;
}

/** 5+ sets drop by 2, 3-4 sets drop by 1, 1-2 sets stay. */
export function easedSets(sets: number): number {
  if (!Number.isFinite(sets) || sets <= 2) return sets;
  return sets >= 5 ? sets - 2 : sets - 1;
}

const looksCardio = (e: EasableExercise) =>
  !!e.isHiit || !!e.isCardio || e.cardioDurationSeconds != null || /cardio/i.test(e.muscleGroup ?? '');

export function easeExercises<T extends EasableExercise>(exercises: T[]): T[] {
  return exercises.map(e => (looksCardio(e) ? e : { ...e, sets: easedSets(e.sets) }));
}

/** Total working sets before and after, for the offer ("18 sets → 13"). */
export function easeSummary(exercises: EasableExercise[]): { before: number; after: number } {
  const before = exercises.reduce((a, e) => a + (e.sets || 0), 0);
  const after = easeExercises(exercises).reduce((a, e) => a + (e.sets || 0), 0);
  return { before, after };
}

/** The member's answer for today, so the offer is not shown again after "Keep". */
const KEY = 'wf-ease-choice';
export function todaysEaseChoice(today: string): 'ease' | 'keep' | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { d, c } = JSON.parse(raw) as { d: string; c: 'ease' | 'keep' };
    return d === today ? c : null;
  } catch { return null; }
}
export function setEaseChoice(today: string, c: 'ease' | 'keep') {
  try { localStorage.setItem(KEY, JSON.stringify({ d: today, c })); } catch { /* storage blocked */ }
}
