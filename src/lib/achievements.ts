import { doc, setDoc, getDoc } from 'firebase/firestore';
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

function isEarned(id: string, p: CheckParams): boolean {
  switch (id) {
    case 'first_workout':  return p.totalWorkouts >= 1;
    case 'workouts_5':     return p.totalWorkouts >= 15;
    case 'workouts_10':    return p.totalWorkouts >= 30;
    case 'workouts_25':    return p.totalWorkouts >= 75;
    case 'workouts_50':    return p.totalWorkouts >= 150;
    case 'workouts_100':   return p.totalWorkouts >= 300;
    case 'workouts_500':   return p.totalWorkouts >= 500;
    case 'workouts_1000':  return p.totalWorkouts >= 1000;
    case 'streak_3':       return p.streak >= 5;
    case 'streak_7':       return p.streak >= 14;
    case 'streak_14':      return p.streak >= 30;
    case 'streak_30':      return p.streak >= 60;
    case 'streak_100':     return p.streak >= 100;
    case 'streak_180':     return p.streak >= 180;
    case 'power_10':       return p.powerLevel >= 25;
    case 'power_50':       return p.powerLevel >= 100;
    case 'power_100':      return p.powerLevel >= 200;
    case 'power_150':      return p.powerLevel >= 300;
    case 'power_500':      return p.powerLevel >= 500;
    case 'power_1000':     return p.powerLevel >= 1000;
    case 'early_bird':     return (p.workoutHour ?? 12) < 7;
    case 'night_owl':      return (p.workoutHour ?? 12) >= 21;
    case 'graveyard_shift':return (p.workoutHour ?? 12) < 4;
    case 'weekend_warrior':return !!p.isWeekend;
    case 'log_meal':       return !!p.hasLoggedMeal;
    case 'meals_10':       return (p.totalMealsLogged ?? 0) >= 30;
    case 'meals_100':      return (p.totalMealsLogged ?? 0) >= 100;
    case 'meals_250':      return (p.totalMealsLogged ?? 0) >= 250;
    default:               return false;
  }
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
      await setDoc(
        doc(db, 'users', userId),
        { achievements: [...existing, ...newlyEarned] },
        { merge: true }
      );
    }
    return newlyEarned;
  } catch (err) {
    console.error('[Achievements] check failed:', err);
    return [];
  }
}
