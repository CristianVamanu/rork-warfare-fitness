/**
 * Per-exercise progress from the member's logged workouts: for each past
 * session that included the exercise, the heaviest completed set. Weights
 * are stored in the unit the member had selected when logging (same
 * assumption the "last time" suggestion makes). Pure, so it is testable.
 */
export interface ProgressPoint { date: Date; weight: number; reps: number }

interface LoggedWorkout {
  completedAt?: unknown;
  exercises?: Array<{ name?: unknown; sets?: Array<{ weight?: unknown; reps?: unknown; completed?: unknown }> }>;
}

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  const t = v as { toDate?: () => Date; seconds?: number };
  if (typeof t.toDate === 'function') return t.toDate();
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000);
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Oldest first, at most `max` points. */
export function exerciseProgress(workouts: LoggedWorkout[], exerciseName: string, max = 10): ProgressPoint[] {
  const target = exerciseName.trim().toLowerCase();
  if (!target) return [];
  const out: ProgressPoint[] = [];
  for (const w of workouts) {
    const date = toDate(w.completedAt);
    if (!date) continue;
    const ex = (w.exercises ?? []).find(e => String(e.name ?? '').trim().toLowerCase() === target);
    if (!ex) continue;
    let best: { weight: number; reps: number } | null = null;
    for (const s of ex.sets ?? []) {
      const weight = Number(s.weight), reps = Number(s.reps);
      if (!s.completed || !(weight > 0)) continue;
      if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) best = { weight, reps };
    }
    if (best) out.push({ date, ...best });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-max);
}
