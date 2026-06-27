import type { FitnessGoal, ExperienceLevel } from '@/types';
import type { UserGoals } from '@/types';

const ACTIVITY_MULTIPLIER: Record<number, number> = {
  2: 1.375,
  3: 1.375,
  4: 1.55,
  5: 1.725,
  6: 1.9,
};

const GOAL_ADJUSTMENT: Record<FitnessGoal, number> = {
  'lose-fat':      -300,
  'recomposition':   0,
  'build-muscle':  +300,
  'strength':      +200,
};

const BASE_CALORIES: Record<ExperienceLevel, number> = {
  beginner:      2000,
  intermediate:  2300,
  advanced:      2600,
};

/**
 * Estimate daily calorie target from onboarding answers.
 * Returns full UserGoals with macro splits tuned per goal.
 */
export function estimateGoals(
  goal: FitnessGoal,
  experience: ExperienceLevel,
  trainingDays: number
): UserGoals {
  const activityMult = ACTIVITY_MULTIPLIER[trainingDays] ?? 1.55;
  const base = BASE_CALORIES[experience] ?? 2200;
  const tdee = Math.round(base * activityMult);
  const calories = Math.max(1400, tdee + (GOAL_ADJUSTMENT[goal] ?? 0));

  // Macro splits per goal (protein-first approach)
  let proteinRatio: number;
  let fatRatio: number;

  if (goal === 'lose-fat') {
    proteinRatio = 0.35; fatRatio = 0.25;
  } else if (goal === 'build-muscle') {
    proteinRatio = 0.30; fatRatio = 0.30;
  } else if (goal === 'strength') {
    proteinRatio = 0.30; fatRatio = 0.35;
  } else {
    proteinRatio = 0.30; fatRatio = 0.30;
  }

  const carbRatio = 1 - proteinRatio - fatRatio;

  return {
    calories,
    protein: Math.round((calories * proteinRatio) / 4),
    carbs:   Math.round((calories * carbRatio) / 4),
    fat:     Math.round((calories * fatRatio) / 9),
    water:   Math.round(trainingDays >= 5 ? 3500 : trainingDays >= 3 ? 3000 : 2500),
  };
}
