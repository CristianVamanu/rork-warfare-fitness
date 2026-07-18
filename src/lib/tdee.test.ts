import { describe, it, expect } from 'vitest';
import { estimateNutritionTargets, calculateBmi, estimateBmiTimeline } from './tdee';

describe('estimateNutritionTargets', () => {
  it('computes a plausible maintenance for a real profile (regression test for the overestimate bug)', () => {
    // Reported bug: 90kg/181cm male, ~4-5 days/week, was showing ~3100 kcal
    // maintenance — implausibly high because the activity multiplier
    // treated "trains 5x/week" as "active all day." After recalibration,
    // a typical 4-5 day/week case should land meaningfully lower.
    const result = estimateNutritionTargets('recomposition', 'intermediate', 5, {
      sex: 'male', age: 30, heightCm: 181, weightKg: 90,
    });
    expect(result.bmr).toBeCloseTo(1886, 0);
    expect(result.maintenanceCalories).toBeLessThan(3000);
    expect(result.maintenanceCalories).toBeGreaterThan(2700);
  });

  it('applies the Mifflin-St Jeor formula correctly for a male', () => {
    const result = estimateNutritionTargets('recomposition', 'intermediate', 3, {
      sex: 'male', age: 25, heightCm: 180, weightKg: 80,
    });
    // BMR = 10*80 + 6.25*180 - 5*25 + 5 = 800 + 1125 - 125 + 5 = 1805
    expect(result.bmr).toBe(1805);
  });

  it('applies the Mifflin-St Jeor formula correctly for a female', () => {
    const result = estimateNutritionTargets('recomposition', 'intermediate', 3, {
      sex: 'female', age: 25, heightCm: 165, weightKg: 60,
    });
    // BMR = 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 -> 1345
    expect(result.bmr).toBe(1345);
  });

  it('applies a real deficit for fat loss and a real surplus for muscle gain', () => {
    const biometrics = { sex: 'male' as const, age: 30, heightCm: 178, weightKg: 85 };
    const fatLoss = estimateNutritionTargets('lose-fat', 'intermediate', 4, biometrics);
    const muscleGain = estimateNutritionTargets('build-muscle', 'intermediate', 4, biometrics);
    const maintenance = estimateNutritionTargets('recomposition', 'intermediate', 4, biometrics);

    expect(fatLoss.calories).toBe(maintenance.calories - 300);
    expect(muscleGain.calories).toBe(maintenance.calories + 300);
    expect(fatLoss.calorieAdjustment).toBe(-300);
    expect(muscleGain.calorieAdjustment).toBe(300);
  });

  it('never drops below the 1400 kcal safety floor even at an extreme deficit', () => {
    const result = estimateNutritionTargets('lose-fat', 'beginner', 2, {
      sex: 'female', age: 60, heightCm: 150, weightKg: 45,
    });
    expect(result.calories).toBeGreaterThanOrEqual(1400);
  });

  it('falls back to a flat per-experience estimate when biometrics are skipped', () => {
    const result = estimateNutritionTargets('recomposition', 'beginner', 3, undefined);
    expect(result.usedRealBiometrics).toBe(false);
    expect(result.bmr).toBe(2000); // BASE_CALORIES.beginner
  });

  it('macro grams always sum back to roughly the target calories', () => {
    const result = estimateNutritionTargets('build-muscle', 'advanced', 6, {
      sex: 'male', age: 28, heightCm: 175, weightKg: 78,
    });
    const recomposedCalories = result.protein * 4 + result.carbs * 4 + result.fat * 9;
    expect(Math.abs(recomposedCalories - result.calories)).toBeLessThan(15);
  });
});

describe('calculateBmi', () => {
  it('classifies a healthy BMI correctly', () => {
    const result = calculateBmi(178, 70);
    expect(result.category).toBe('Healthy');
  });

  it('classifies an underweight BMI correctly', () => {
    const result = calculateBmi(178, 45);
    expect(result.category).toBe('Underweight');
  });

  it('classifies an obese BMI correctly', () => {
    const result = calculateBmi(170, 100);
    expect(result.category).toBe('Obese');
  });
});

describe('estimateBmiTimeline', () => {
  it('returns null weeksToHealthy for an already-healthy BMI', () => {
    const result = estimateBmiTimeline(178, 70);
    expect(result.weeksToHealthy).toBeNull();
    expect(result.weightChangeKg).toBe(0);
  });

  it('projects a positive weight change for an underweight profile', () => {
    const result = estimateBmiTimeline(178, 45);
    expect(result.weightChangeKg).toBeGreaterThan(0);
    expect(result.weeksToHealthy).not.toBeNull();
  });

  it('projects a negative weight change for an overweight profile', () => {
    const result = estimateBmiTimeline(170, 100);
    expect(result.weightChangeKg).toBeLessThan(0);
    expect(result.weeksToHealthy).not.toBeNull();
  });
});
