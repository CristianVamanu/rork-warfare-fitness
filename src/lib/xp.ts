export interface LevelTier {
  min: number;
  title: string;
  color: string;
}

export const LEVEL_TIERS: LevelTier[] = [
  { min: 0,   title: 'Beginner',   color: 'text-gray-400'   },
  { min: 10,  title: 'Consistent', color: 'text-green-400'  },
  { min: 25,  title: 'Focused',    color: 'text-blue-400'   },
  { min: 50,  title: 'Dedicated',  color: 'text-purple-400' },
  { min: 75,  title: 'Advanced',   color: 'text-orange-400' },
  { min: 100, title: 'Expert',     color: 'text-accent'     },
  { min: 150, title: 'Champion',   color: 'text-red-400'    },
];

export function getLevelTier(powerLevel: number): LevelTier {
  return [...LEVEL_TIERS].reverse().find((t) => powerLevel >= t.min) ?? LEVEL_TIERS[0];
}

export function getLevelTitle(powerLevel: number): string {
  return getLevelTier(powerLevel).title;
}

/** XP earned from a single workout session. */
export function calcWorkoutXP(
  durationMinutes: number,
  completedSets: number,
  totalWeightKg: number
): number {
  return Math.round(
    durationMinutes * 5 +           // 5 XP per minute
    completedSets * 10 +            // 10 XP per set
    Math.min(totalWeightKg / 50, 50) // up to 50 XP from volume
  );
}

/**
 * Accumulate XP into a power level (1 level per 100 XP), starting at 1.
 *
 * The `+ 1` matters: signup seeds powerLevel to 1 (see auth.ts), but this
 * used to return `floor(xp/100)`, i.e. 0 for anyone under 100 XP. So a new
 * user displayed Level 1, finished their first workout worth ~80 XP, and
 * completeWorkout() overwrote it with 0 — a visible DROP as a reward for
 * training. Starting the scale at 1 also keeps xpToNextLevel() below
 * consistent with it: the remainder hits 100 exactly when the level ticks
 * over, which `max(1, floor(...))` would not have done (that would have
 * stalled level 1 across the whole 0-199 range while the progress bar
 * filled and reset at 100).
 */
export function xpToPowerLevel(totalXP: number): number {
  return Math.floor(totalXP / 100) + 1;
}

/** XP needed to reach the next power level. */
export function xpToNextLevel(totalXP: number): { current: number; needed: number } {
  const remainder = totalXP % 100;
  return { current: remainder, needed: 100 };
}
