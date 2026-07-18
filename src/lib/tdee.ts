import type { FitnessGoal, ExperienceLevel, BiologicalSex } from '@/types';
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

export interface Biometrics {
  sex: BiologicalSex;
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface NutritionTargets extends UserGoals {
  /** Estimated Basal Metabolic Rate — calories burned at total rest. */
  bmr: number;
  /** Total Daily Energy Expenditure at maintenance — the "eat this to stay the same weight" number. */
  maintenanceCalories: number;
  /** Positive = surplus (bulking), negative = deficit (cutting), 0 = at maintenance. */
  calorieAdjustment: number;
  usedRealBiometrics: boolean;
}

/**
 * Core calorie/macro math — deterministic, not left to an LLM, because
 * arithmetic like this needs to be exactly right every time, not
 * approximately right most of the time. Mifflin-St Jeor for BMR (the
 * modern standard, more accurate than the older Harris-Benedict equation),
 * an activity multiplier from training frequency, then a goal-based
 * adjustment off that maintenance number.
 */
export function estimateNutritionTargets(
  goal: FitnessGoal,
  experience: ExperienceLevel,
  trainingDays: number,
  biometrics?: Biometrics
): NutritionTargets {
  const activityMult = ACTIVITY_MULTIPLIER[trainingDays] ?? 1.55;
  const usedRealBiometrics = !!biometrics;

  let bmr: number;
  if (biometrics && biometrics.sex !== 'prefer-not-to-say') {
    const { sex, age, heightCm, weightKg } = biometrics;
    bmr = sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else if (biometrics) {
    // Sex not disclosed — average the male/female BMR formulas
    const { age, heightCm, weightKg } = biometrics;
    const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    bmr = (bmrMale + bmrFemale) / 2;
  } else {
    // No biometrics at all (step skipped) — flat per-experience-level guess
    bmr = BASE_CALORIES[experience] ?? 2200;
  }
  bmr = Math.round(bmr);

  const maintenanceCalories = Math.round(bmr * activityMult);
  const calorieAdjustment = GOAL_ADJUSTMENT[goal] ?? 0;
  const calories = Math.max(1400, maintenanceCalories + calorieAdjustment);

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
    bmr,
    maintenanceCalories,
    calorieAdjustment,
    usedRealBiometrics,
    calories,
    protein: Math.round((calories * proteinRatio) / 4),
    carbs:   Math.round((calories * carbRatio) / 4),
    fat:     Math.round((calories * fatRatio) / 9),
    water:   Math.round(trainingDays >= 5 ? 3500 : trainingDays >= 3 ? 3000 : 2500),
  };
}

/** Backwards-compatible wrapper — just the four goal numbers, no breakdown. */
export function estimateGoals(
  goal: FitnessGoal,
  experience: ExperienceLevel,
  trainingDays: number,
  biometrics?: Biometrics
): UserGoals {
  const { calories, protein, carbs, fat, water } = estimateNutritionTargets(goal, experience, trainingDays, biometrics);
  return { calories, protein, carbs, fat, water };
}

export interface BmiResult {
  bmi: number;
  category: 'Underweight' | 'Healthy' | 'Overweight' | 'Obese';
  healthyWeightRangeKg: [number, number];
}

/** Standard WHO BMI calculation and category bands. */
export function calculateBmi(heightCm: number, weightKg: number): BmiResult {
  const heightM = heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  const category: BmiResult['category'] =
    bmi < 18.5 ? 'Underweight' :
    bmi < 25 ? 'Healthy' :
    bmi < 30 ? 'Overweight' : 'Obese';
  const healthyWeightRangeKg: [number, number] = [
    Math.round(18.5 * heightM * heightM * 10) / 10,
    Math.round(24.9 * heightM * heightM * 10) / 10,
  ];
  return { bmi, category, healthyWeightRangeKg };
}

export interface BmiProjection {
  weeksToHealthy: number | null; // null = already healthy
  weightChangeKg: number; // positive = needs to gain, negative = needs to lose
}

/**
 * Conservative, evidence-based rate of change: ~0.5kg/week for fat loss,
 * ~0.25kg/week for lean weight gain. This is an estimate for motivation,
 * not a medical projection.
 */
export function estimateBmiTimeline(heightCm: number, weightKg: number): BmiProjection {
  const { category, healthyWeightRangeKg } = calculateBmi(heightCm, weightKg);
  if (category === 'Healthy') return { weeksToHealthy: null, weightChangeKg: 0 };

  if (category === 'Underweight') {
    const targetWeight = healthyWeightRangeKg[0];
    const gain = targetWeight - weightKg;
    return { weeksToHealthy: Math.ceil(gain / 0.25), weightChangeKg: gain };
  }

  // Overweight or Obese
  const targetWeight = healthyWeightRangeKg[1];
  const loss = weightKg - targetWeight;
  return { weeksToHealthy: Math.ceil(loss / 0.5), weightChangeKg: -loss };
}
