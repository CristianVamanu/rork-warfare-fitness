// Timed holds: exercises measured in seconds held, not reps (plank, wall sit,
// dead hang...). The data model has no separate "hold" type; a hold is stored
// as a timed exercise (isCardio + cardioDurationSeconds), which is what makes
// the session player show a countdown instead of a rep counter. These helpers
// recognise a hold so the AI generator, the program builder and the player
// all treat "Plank, 30" as 30 seconds rather than 30 reps.

const HOLD_NAME = /^(?:(?:side|forearm|elbow|high|low|straight[- ]arm|rkc|copenhagen|reverse|weighted|front)\s+)*plank(?:\s+hold)?$|\bwall sit\b|\bdead hang\b|\bactive hang\b|\bhollow(?:\s+body)?\s+hold\b|\bl[- ]sit\b|\bsuperman hold\b|\bglute bridge hold\b|\bisometric\b|\bhold$/i;

/** True for exercises that are held for time. "Plank Row" or "Plank Jack" are not holds. */
export function isTimedHoldName(name: string | undefined): boolean {
  return !!name && HOLD_NAME.test(name.trim());
}

/** "30s", "45 sec", "1 min", "90 seconds" -> seconds. A bare number is not a duration. */
export function explicitSeconds(reps: string | number | undefined): number | null {
  if (typeof reps !== 'string') return null;
  const m = reps.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const sec = /^m/i.test(m[2]) ? n * 60 : n;
  return sec > 0 ? Math.round(sec) : null;
}

/** Seconds to hold, read from a reps value: "30", 30, "30s", "20 each side", "30-45". */
export function holdSecondsFromReps(reps: string | number | undefined, fallback = 30): number {
  const explicit = explicitSeconds(reps);
  if (explicit) return Math.min(explicit, 900);
  const m = String(reps ?? '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n >= 5 ? Math.min(n, 900) : fallback;
}

/** Should this exercise run on a timer because it is a hold (by name, or reps written as a duration)? */
export function isTimedHold(ex: { name?: string; reps?: string | number }): boolean {
  return isTimedHoldName(ex.name) || (explicitSeconds(ex.reps) !== null && !/\d\s*(m|km|mi|mile|miles)\b/i.test(String(ex.reps).replace(/\d+\s*(min|mins|minute|minutes)\b/i, '')));
}

/** "30s", "1 min", "1 min 30s" for summaries. */
export function formatHoldSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s}s` : `${m} min`;
}
