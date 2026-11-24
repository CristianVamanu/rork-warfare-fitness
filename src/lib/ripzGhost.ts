/**
 * Ripz ghost: race your own best pace on a move.
 *
 * Every pull deals a different number, so the ghost is a PACE (seconds per
 * rep), not a time. Racing 30 push-ups against a ghost that did 20 in 30s
 * means the ghost needs 45s. Beat it and your pace becomes the new ghost.
 *
 * Nothing counts the reps, so a time faster than a person could physically
 * move is not a record: it neither wins nor replaces the ghost.
 */

export interface RipzGhost {
  /** Seconds per rep. */
  pace: number;
  /** The pull the ghost was set on, for "25 push-ups in 0:41". */
  count: number;
  seconds: number;
  /** ms since epoch. */
  at: number;
}

/** Fastest believable seconds per rep. Anything quicker was a mis-tap. */
export const MIN_PACE: Record<string, number> = {
  'push-ups': 0.7,
  squats: 0.6,
  'sit-ups': 0.8,
  lunges: 0.7,
  'mountain-climbers': 0.25,
};

export const canRaceGhost = (moveId: string): boolean => moveId in MIN_PACE;

/** How long the ghost takes for this pull, in seconds (one decimal). */
export function ghostSeconds(ghost: RipzGhost, count: number): number {
  return Math.round(ghost.pace * count * 10) / 10;
}

export interface GhostVerdict {
  /** False when the time is faster than humanly possible: not saved, not a win. */
  valid: boolean;
  /** null when there was no ghost yet (this run sets the first one). */
  beat: boolean | null;
  /** Seconds between you and the ghost (positive = you were faster). */
  margin: number;
  /** The ghost to save, when this run is valid and is a new best pace. */
  next?: RipzGhost;
}

export function judgeRun(prev: RipzGhost | undefined, moveId: string, count: number, seconds: number, now = Date.now()): GhostVerdict {
  const min = MIN_PACE[moveId] ?? 0.5;
  const s = Math.round(seconds * 10) / 10;
  if (count <= 0 || s < min * count) return { valid: false, beat: null, margin: 0 };
  const pace = s / count;
  const mine: RipzGhost = { pace: Math.round(pace * 1000) / 1000, count, seconds: s, at: now };
  if (!prev) return { valid: true, beat: null, margin: 0, next: mine };
  const target = ghostSeconds(prev, count);
  const margin = Math.round((target - s) * 10) / 10;
  const beat = margin > 0;
  return { valid: true, beat, margin, next: beat ? mine : undefined };
}

/** 41.2 -> "0:41.2", 75 -> "1:15.0". */
export function formatRace(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
