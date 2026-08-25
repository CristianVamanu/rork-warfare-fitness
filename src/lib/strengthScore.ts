/**
 * Warfare Strength Score — deterministic scoring engine.
 *
 * IMPORTANT: the STANDARDS table below is an illustrative, hand-authored
 * approximation of bodyweight-multiple strength tiers (Beginner → Elite),
 * NOT sourced from a validated research dataset. It exists as a single,
 * isolated place to update later (e.g. once real normed data is available)
 * without touching any of the scoring logic itself. Every score/percentile
 * this module produces is presented to users as an estimate for motivation/
 * comparison purposes, not a medical or scientifically-validated measurement.
 */

export type Sex = 'male' | 'female';
export type WeightUnit = 'kg' | 'lbs';

export interface StrengthInputs {
  age: number;
  sex: Sex;
  bodyweightKg: number;
  squatKg: number;
  benchKg: number;
  deadliftKg: number;
  ohpKg?: number;
  pullupReps?: number;
}

export type LiftKey = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'pullups';

export interface LiftScore {
  key: LiftKey;
  label: string;
  valueKg?: number; // undefined for pull-ups (reps-based)
  reps?: number;
  ratio: number; // relative-strength ratio used for scoring (lift/bodyweight, age-adjusted)
  percentile: number; // 0-100
}

export interface StrengthResult {
  score: number; // 0-100 overall Warfare Strength Score
  percentile: number; // 0-100, same scale as score — "stronger than X% of {sex} your age"
  classification: string;
  liftScores: LiftScore[];
  strongestLift: LiftScore;
  weakestLift: LiftScore;
  relativeStrength: number; // total (squat+bench+deadlift) / bodyweight
  nextMilestone: { lift: LiftKey; label: string; targetKg: number; remainingKg: number } | null;
}

// ---------------------------------------------------------------------------
// Standards — ratio (lift / bodyweight) required to reach each tier, by sex.
// Pull-ups use reps directly (bodyweight already the resistance).
// Tiers: Beginner(0) → Novice(1) → Intermediate(2) → Advanced(3) → Elite(4).
// Percentile-within-tier is linearly interpolated between these breakpoints,
// then the whole 0-4 tier scale is mapped onto 0-100.
// ---------------------------------------------------------------------------
const RATIO_STANDARDS: Record<Sex, Record<'squat' | 'bench' | 'deadlift' | 'ohp', number[]>> = {
  male: {
    squat: [0.5, 1.0, 1.5, 2.0, 2.5],
    bench: [0.4, 0.75, 1.1, 1.5, 1.9],
    deadlift: [0.75, 1.25, 1.75, 2.25, 2.75],
    ohp: [0.3, 0.5, 0.7, 0.9, 1.15],
  },
  female: {
    squat: [0.35, 0.7, 1.05, 1.4, 1.8],
    bench: [0.25, 0.45, 0.65, 0.9, 1.15],
    deadlift: [0.5, 0.9, 1.3, 1.7, 2.1],
    ohp: [0.2, 0.32, 0.45, 0.6, 0.75],
  },
};
const PULLUP_STANDARDS: Record<Sex, number[]> = {
  male: [1, 5, 10, 18, 25],
  female: [1, 3, 6, 10, 15],
};

// Simple, documented age adjustment — strength ratios are scaled up slightly
// for ages outside the typical peak-strength window (25-35) before being
// looked up against the (implicitly adult-peak) standards above, rather than
// maintaining a second full standards table per age band. Deliberately mild
// (max +/-12%) and flat within the peak window.
function ageAdjustmentFactor(age: number): number {
  if (age >= 25 && age <= 35) return 1;
  if (age < 25) return 1 + Math.min(25 - age, 10) * 0.006; // up to +6% at age 15
  return 1 + Math.min(age - 35, 40) * 0.003; // up to +12% at age 75+
}

function tierPercentile(value: number, breakpoints: number[]): number {
  const n = breakpoints.length; // 5 tier breakpoints -> 0..100 in n segments of equal width
  if (value <= 0) return 0;
  if (value < breakpoints[0]) {
    // Below "Beginner" — scale 0..(100/n) proportionally to how close to the first breakpoint.
    return Math.max(0, (value / breakpoints[0]) * (100 / n));
  }
  for (let i = 0; i < n - 1; i++) {
    if (value < breakpoints[i + 1]) {
      const segStart = (100 / n) * (i + 1);
      const segFrac = (value - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
      return segStart + segFrac * (100 / n);
    }
  }
  // At/above the top ("Elite") breakpoint — approach 100 asymptotically so an
  // outlier lift can't literally hit 100 and look like a data error, while
  // still reading as "elite" (high 90s).
  const over = value / breakpoints[n - 1];
  return Math.min(99.5, 100 - 5 / over);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const LIFT_LABELS: Record<LiftKey, string> = {
  squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift', ohp: 'Overhead Press', pullups: 'Pull-ups',
};

export function calculateStrengthScore(inputs: StrengthInputs): StrengthResult {
  const bw = inputs.bodyweightKg;
  if (!(bw > 0)) throw new Error('Bodyweight must be greater than 0');
  const ageFactor = ageAdjustmentFactor(inputs.age);
  const standards = RATIO_STANDARDS[inputs.sex];

  const liftScores: LiftScore[] = [];

  const addWeightLift = (key: 'squat' | 'bench' | 'deadlift' | 'ohp', kgValue: number | undefined) => {
    if (kgValue === undefined || kgValue <= 0) return;
    const ratio = (kgValue / bw) * ageFactor;
    liftScores.push({
      key, label: LIFT_LABELS[key], valueKg: round1(kgValue), ratio: round1(ratio),
      percentile: round1(tierPercentile(ratio, standards[key])),
    });
  };
  addWeightLift('squat', inputs.squatKg);
  addWeightLift('bench', inputs.benchKg);
  addWeightLift('deadlift', inputs.deadliftKg);
  addWeightLift('ohp', inputs.ohpKg);

  if (inputs.pullupReps !== undefined && inputs.pullupReps > 0) {
    const adjustedReps = inputs.pullupReps * ageFactor;
    liftScores.push({
      key: 'pullups', label: LIFT_LABELS.pullups, reps: inputs.pullupReps, ratio: round1(adjustedReps),
      percentile: round1(tierPercentile(adjustedReps, PULLUP_STANDARDS[inputs.sex])),
    });
  }

  if (liftScores.length === 0) throw new Error('At least one lift is required');

  // Overall score: the three mandatory lifts always count; optional lifts
  // (OHP, pull-ups) each count at half weight so submitting them nudges the
  // score without letting a single strong optional lift dominate it.
  const mandatoryKeys: LiftKey[] = ['squat', 'bench', 'deadlift'];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const ls of liftScores) {
    const w = mandatoryKeys.includes(ls.key) ? 1 : 0.5;
    weightedSum += ls.percentile * w;
    weightTotal += w;
  }
  const score = Math.round(weightedSum / weightTotal);

  const strongestLift = liftScores.reduce((a, b) => (b.percentile > a.percentile ? b : a));
  const weakestLift = liftScores.reduce((a, b) => (b.percentile < a.percentile ? b : a));

  const relativeStrength = round1(
    ((inputs.squatKg || 0) + (inputs.benchKg || 0) + (inputs.deadliftKg || 0)) / bw
  );

  const classification = classify(liftScores, score);
  const nextMilestone = computeNextMilestone(liftScores);

  return {
    score,
    percentile: score, // same 0-100 scale, presented as "stronger than X% of people your age/sex"
    classification,
    liftScores,
    strongestLift,
    weakestLift,
    relativeStrength,
    nextMilestone,
  };
}

// Deterministic classification from the lift PROFILE (shape), not just the
// overall score — a squat-dominant profile reads differently from a
// deadlift-dominant one even at the same score.
function classify(liftScores: LiftScore[], score: number): string {
  const byKey = Object.fromEntries(liftScores.map((l) => [l.key, l])) as Partial<Record<LiftKey, LiftScore>>;
  const squat = byKey.squat?.percentile ?? 0;
  const bench = byKey.bench?.percentile ?? 0;
  const deadlift = byKey.deadlift?.percentile ?? 0;
  const pullups = byKey.pullups?.percentile ?? 0;

  const spread = Math.max(squat, bench, deadlift) - Math.min(squat, bench, deadlift);

  if (score >= 80 && spread < 12) return 'THE POWERHOUSE'; // elite and balanced across the board
  if (pullups >= 75 && pullups >= Math.max(squat, bench, deadlift) - 5) return 'THE ATHLETE'; // bodyweight-strength led
  if (deadlift === Math.max(squat, bench, deadlift) && deadlift - bench >= 15) return 'THE ENGINE'; // posterior-chain dominant
  if (squat === Math.max(squat, bench, deadlift) && squat - bench >= 15) return 'THE TANK'; // leg-dominant
  if (spread < 10 && score >= 50) return 'THE BUILDER'; // steady, well-rounded, mid-high
  return 'THE GRINDER'; // early-stage / building the base
}

// Nearest motivating target: the next 5kg round-number step above the
// weakest lift's current weight (weight-based lifts only — pull-ups aren't
// a "kg milestone"). Falls back to the strongest weight-based lift if the
// weakest lift has no kg value (i.e. weakest lift was pull-ups).
function computeNextMilestone(liftScores: LiftScore[]): StrengthResult['nextMilestone'] {
  const weightBased = liftScores.filter((l) => l.valueKg !== undefined);
  if (weightBased.length === 0) return null;
  const target = weightBased.reduce((a, b) => (b.percentile < a.percentile ? b : a));
  const current = target.valueKg!;
  const targetKg = Math.ceil((current + 0.01) / 5) * 5;
  return { lift: target.key, label: target.label, targetKg, remainingKg: round1(targetKg - current) };
}

export function kgToLbsRounded(kg: number): number {
  return Math.round(kg * 2.20462);
}
export function lbsToKgRounded(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10;
}
