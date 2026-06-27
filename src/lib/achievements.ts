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
  // Workout milestones
  { id: 'first_workout',  icon: '💪', title: 'Day One',           desc: 'Complete your first workout',     category: 'workouts' },
  { id: 'workouts_5',     icon: '🏅', title: 'Getting Serious',   desc: '5 workouts completed',            category: 'workouts' },
  { id: 'workouts_10',    icon: '🥇', title: 'Committed',         desc: '10 workouts completed',           category: 'workouts' },
  { id: 'workouts_25',    icon: '🏆', title: 'Dedicated',         desc: '25 workouts completed',           category: 'workouts' },
  { id: 'workouts_50',    icon: '👑', title: 'High Achiever',     desc: '50 workouts completed',           category: 'workouts' },
  { id: 'workouts_100',   icon: '💎', title: 'Century Club',      desc: '100 workouts completed',          category: 'workouts' },
  // Streak milestones
  { id: 'streak_3',       icon: '🔥', title: 'On Fire',           desc: '3-day workout streak',            category: 'streak'   },
  { id: 'streak_7',       icon: '⚡', title: 'Week Strong',       desc: '7-day streak',                   category: 'streak'   },
  { id: 'streak_14',      icon: '🌟', title: 'Two Weeks In',      desc: '14-day streak',                  category: 'streak'   },
  { id: 'streak_30',      icon: '🔱', title: '30-Day Streak',     desc: '30 days of consistent training', category: 'streak'   },
  // Power level milestones
  { id: 'power_10',       icon: '🚀', title: 'Power Rising',      desc: 'Reach Power Level 10',           category: 'power'    },
  { id: 'power_50',       icon: '⭐', title: 'Peak Performance',  desc: 'Reach Power Level 50',           category: 'power'    },
  { id: 'power_100',      icon: '🌊', title: 'High Achiever',     desc: 'Reach Power Level 100',          category: 'power'    },
  // Time of day
  { id: 'early_bird',     icon: '🌅', title: 'Early Bird',        desc: 'Complete a workout before 7am',  category: 'time'     },
  { id: 'night_owl',      icon: '🦉', title: 'Night Owl',         desc: 'Complete a workout after 9pm',   category: 'time'     },
  // Nutrition
  { id: 'log_meal',       icon: '🥗', title: 'Fuel Up',           desc: 'Log your first meal',            category: 'nutrition'},
];

interface CheckParams {
  totalWorkouts: number;
  streak: number;
  powerLevel: number;
  workoutHour?: number;
  hasLoggedMeal?: boolean;
}

function isEarned(id: string, p: CheckParams): boolean {
  switch (id) {
    case 'first_workout':  return p.totalWorkouts >= 1;
    case 'workouts_5':     return p.totalWorkouts >= 5;
    case 'workouts_10':    return p.totalWorkouts >= 10;
    case 'workouts_25':    return p.totalWorkouts >= 25;
    case 'workouts_50':    return p.totalWorkouts >= 50;
    case 'workouts_100':   return p.totalWorkouts >= 100;
    case 'streak_3':       return p.streak >= 3;
    case 'streak_7':       return p.streak >= 7;
    case 'streak_14':      return p.streak >= 14;
    case 'streak_30':      return p.streak >= 30;
    case 'power_10':       return p.powerLevel >= 10;
    case 'power_50':       return p.powerLevel >= 50;
    case 'power_100':      return p.powerLevel >= 100;
    case 'early_bird':     return (p.workoutHour ?? 12) < 7;
    case 'night_owl':      return (p.workoutHour ?? 12) >= 21;
    case 'log_meal':       return !!p.hasLoggedMeal;
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
