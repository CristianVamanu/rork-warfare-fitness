import { doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  category: 'workouts' | 'streak' | 'power' | 'time' | 'nutrition';
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Workout milestones — first one stays an easy onboarding win, the rest
  // scaled up meaningfully so they mean something and give long-term goals.
  { id: 'first_workout',  icon: '💪', title: 'Day One',           desc: 'Complete your first workout',     category: 'workouts' },
  { id: 'workouts_5',     icon: '🏅', title: 'Getting Serious',   desc: '15 workouts completed',           category: 'workouts' },
  { id: 'workouts_10',    icon: '🥇', title: 'Committed',         desc: '30 workouts completed',           category: 'workouts' },
  { id: 'workouts_25',    icon: '🏆', title: 'Dedicated',         desc: '75 workouts completed',           category: 'workouts' },
  { id: 'workouts_50',    icon: '👑', title: 'High Achiever',     desc: '150 workouts completed',          category: 'workouts' },
  { id: 'workouts_100',   icon: '💎', title: 'Century Club',      desc: '300 workouts completed',          category: 'workouts' },
  { id: 'workouts_500',   icon: '🐐', title: 'Legend',            desc: '500 workouts completed',          category: 'workouts' },
  { id: 'workouts_1000',  icon: '🌠', title: 'Immortal',          desc: '1,000 workouts completed',        category: 'workouts' },
  // Streak milestones
  { id: 'streak_3',       icon: '🔥', title: 'On Fire',           desc: '5-day workout streak',            category: 'streak'   },
  { id: 'streak_7',       icon: '⚡', title: 'Week Strong',       desc: '14-day streak',                  category: 'streak'   },
  { id: 'streak_14',      icon: '🌟', title: 'Two Weeks In',      desc: '30-day streak',                  category: 'streak'   },
  { id: 'streak_30',      icon: '🔱', title: '30-Day Streak',     desc: '60 days of consistent training', category: 'streak'   },
  { id: 'streak_100',     icon: '🗿', title: 'Iron Will',         desc: '100-day streak',                 category: 'streak'   },
  { id: 'streak_180',     icon: '🛡️', title: 'Unbreakable',       desc: '180-day streak',                 category: 'streak'   },
  // Power level milestones
  { id: 'power_10',       icon: '🚀', title: 'Power Rising',      desc: 'Reach Power Level 25',           category: 'power'    },
  { id: 'power_50',       icon: '⭐', title: 'Peak Performance',  desc: 'Reach Power Level 100',          category: 'power'    },
  { id: 'power_100',      icon: '🌊', title: 'High Achiever',     desc: 'Reach Power Level 200',          category: 'power'    },
  { id: 'power_150',      icon: '🏆', title: 'Champion',          desc: 'Reach Power Level 300',          category: 'power'    },
  { id: 'power_500',      icon: '🌌', title: 'Mythic',            desc: 'Reach Power Level 500',          category: 'power'    },
  { id: 'power_1000',     icon: '👁️', title: 'Ascended',          desc: 'Reach Power Level 1,000',        category: 'power'    },
  // Time of day
  { id: 'early_bird',     icon: '🌅', title: 'Early Bird',        desc: 'Complete a workout before 7am',  category: 'time'     },
  { id: 'night_owl',      icon: '🦉', title: 'Night Owl',         desc: 'Complete a workout after 9pm',   category: 'time'     },
  { id: 'graveyard_shift',icon: '🕛', title: 'Graveyard Shift',   desc: 'Complete a workout between midnight and 4am', category: 'time' },
  { id: 'weekend_warrior',icon: '🌆', title: 'Weekend Warrior',   desc: 'Complete a workout on a Saturday or Sunday', category: 'time' },
  // Nutrition
  { id: 'log_meal',       icon: '🥗', title: 'Fuel Up',           desc: 'Log your first meal',            category: 'nutrition'},
  { id: 'meals_10',       icon: '🍽️', title: 'Meal Prep Pro',     desc: 'Log 30 meals',                   category: 'nutrition'},
  { id: 'meals_100',      icon: '👨‍🍳', title: 'Nutrition Master',  desc: 'Log 100 meals',                  category: 'nutrition'},
  { id: 'meals_250',      icon: '🍱', title: 'Nutrition Sensei',  desc: 'Log 250 meals',                  category: 'nutrition'},
];

interface CheckParams {
  totalWorkouts: number;
  streak: number;
  powerLevel: number;
  workoutHour?: number;
  isWeekend?: boolean;
  hasLoggedMeal?: boolean;
  totalMealsLogged?: number;
}

// Numeric-target achievements only — the boolean ones (early_bird, night_owl,
// graveyard_shift, weekend_warrior, log_meal) have no "how close am I"
// concept, so they're deliberately absent here and stay in the switch below.
const ACHIEVEMENT_THRESHOLDS: Record<string, { statKey: keyof CheckParams; target: number }> = {
  first_workout:  { statKey: 'totalWorkouts', target: 1 },
  workouts_5:     { statKey: 'totalWorkouts', target: 15 },
  workouts_10:    { statKey: 'totalWorkouts', target: 30 },
  workouts_25:    { statKey: 'totalWorkouts', target: 75 },
  workouts_50:    { statKey: 'totalWorkouts', target: 150 },
  workouts_100:   { statKey: 'totalWorkouts', target: 300 },
  workouts_500:   { statKey: 'totalWorkouts', target: 500 },
  workouts_1000:  { statKey: 'totalWorkouts', target: 1000 },
  streak_3:       { statKey: 'streak', target: 5 },
  streak_7:       { statKey: 'streak', target: 14 },
  streak_14:      { statKey: 'streak', target: 30 },
  streak_30:      { statKey: 'streak', target: 60 },
  streak_100:     { statKey: 'streak', target: 100 },
  streak_180:     { statKey: 'streak', target: 180 },
  power_10:       { statKey: 'powerLevel', target: 25 },
  power_50:       { statKey: 'powerLevel', target: 100 },
  power_100:      { statKey: 'powerLevel', target: 200 },
  power_150:      { statKey: 'powerLevel', target: 300 },
  power_500:      { statKey: 'powerLevel', target: 500 },
  power_1000:     { statKey: 'powerLevel', target: 1000 },
  meals_10:       { statKey: 'totalMealsLogged', target: 30 },
  meals_100:      { statKey: 'totalMealsLogged', target: 100 },
  meals_250:      { statKey: 'totalMealsLogged', target: 250 },
};

function isEarned(id: string, p: CheckParams): boolean {
  const threshold = ACHIEVEMENT_THRESHOLDS[id];
  if (threshold) return (p[threshold.statKey] as number | undefined ?? 0) >= threshold.target;
  switch (id) {
    case 'early_bird':     return (p.workoutHour ?? 12) < 7;
    case 'night_owl':      return (p.workoutHour ?? 12) >= 21;
    case 'graveyard_shift':return (p.workoutHour ?? 12) < 4;
    case 'weekend_warrior':return !!p.isWeekend;
    case 'log_meal':       return !!p.hasLoggedMeal;
    default:               return false;
  }
}

/** Fractional progress (0-1) toward a numeric-target achievement, or null for
 * boolean ones with no "how close" concept. Powers near-miss copy like
 * "2 workouts from Century Club" on the achievements page. */
export function achievementProgress(id: string, p: CheckParams): number | null {
  const threshold = ACHIEVEMENT_THRESHOLDS[id];
  if (!threshold) return null;
  const current = (p[threshold.statKey] as number | undefined) ?? 0;
  return Math.min(1, current / threshold.target);
}

/** How many more of the underlying stat are needed to earn this achievement,
 * or null if already earned / not a numeric-target achievement. */
export function achievementRemaining(id: string, p: CheckParams): number | null {
  const threshold = ACHIEVEMENT_THRESHOLDS[id];
  if (!threshold) return null;
  const current = (p[threshold.statKey] as number | undefined) ?? 0;
  const remaining = threshold.target - current;
  return remaining > 0 ? remaining : null;
}

/** Check params against all achievements, award newly earned ones, return their IDs. */
export async function checkAndAwardAchievements(
  userId: string,
  params: CheckParams
): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const existing: string[] = (snap.data()?.achievements as string[]) ?? [];

    const newlyEarned = ACHIEVEMENT_DEFS
      .map((d) => d.id)
      .filter((id) => !existing.includes(id) && isEarned(id, params));

    if (newlyEarned.length > 0) {
      // arrayUnion is applied atomically server-side against whatever the
      // document actually contains at write time — unlike writing back
      // `[...existing, ...newlyEarned]` from a snapshot read here, it can't
      // lose an achievement another concurrent call (e.g. logMealAction's
      // unawaited check firing around the same time as a workout
      // completion) already added between this read and this write.
      await setDoc(
        doc(db, 'users', userId),
        { achievements: arrayUnion(...newlyEarned) },
        { merge: true }
      );
    }
    return newlyEarned;
  } catch (err) {
    console.error('[Achievements] check failed:', err);
    return [];
  }
}
