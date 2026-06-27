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

/** Accumulate XP into a power level (1 level per 100 XP). */
export function xpToPowerLevel(totalXP: number): number {
  return Math.floor(totalXP / 100);
}

/** XP needed to reach the next power level. */
export function xpToNextLevel(totalXP: number): { current: number; needed: number } {
  const remainder = totalXP % 100;
  return { current: remainder, needed: 100 };
}
