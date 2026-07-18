export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns an athlete's calorie/macro targets right after onboarding.
 *
 * The numbers themselves (BMR, maintenance, target, macros) are computed
 * deterministically in tdee.ts via Mifflin-St Jeor — arithmetic like this
 * needs to be exactly right every time, and an LLM asked to "calculate"
 * calories is liable to hallucinate plausible-looking wrong numbers. The
 * short rationale sentence is a template, not an OpenAI call — onboarding
 * already makes one AI call (program generation) on this same critical
 * path, and a second sequential LLM round-trip just for one sentence of
 * flavor text was adding several extra seconds to a screen a brand-new
 * user is sitting and waiting on. This route is now pure computation, no
 * network call, so it resolves near-instantly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { estimateNutritionTargets, type Biometrics } from '@/lib/tdee';
import type { FitnessGoal, ExperienceLevel } from '@/types';

const GOAL_LABEL: Record<FitnessGoal, string> = {
  'lose-fat': 'Fat Loss',
  'build-muscle': 'Muscle Gain',
  recomposition: 'Body Recomposition',
  strength: 'Strength',
};

function templateRationale(goal: FitnessGoal, adjustment: number, usedRealBiometrics: string) {
  const magnitude = Math.abs(adjustment);
  if (adjustment < 0) {
    return `Based on ${usedRealBiometrics}, you're set at a ${magnitude}-calorie daily deficit from maintenance — enough to lose fat steadily without sacrificing strength or energy in the gym.`;
  }
  if (adjustment > 0) {
    return `Based on ${usedRealBiometrics}, you're set at a ${magnitude}-calorie daily surplus above maintenance — enough fuel to build muscle without excess fat gain.`;
  }
  return `Based on ${usedRealBiometrics}, you're set right at maintenance — the goal here is recomposition, not a scale change, so calories stay steady while training does the work.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const goal = body.goal as FitnessGoal;
    const experience = body.experience as ExperienceLevel;
    const trainingDays = Number(body.trainingDays);
    const biometrics = body.biometrics as Biometrics | undefined;

    if (!goal || !experience || !trainingDays) {
      return NextResponse.json({ error: 'goal, experience, and trainingDays are required' }, { status: 400 });
    }

    const targets = estimateNutritionTargets(goal, experience, trainingDays, biometrics);
    const biometricsDescription = biometrics
      ? `your stats (${biometrics.sex !== 'prefer-not-to-say' ? biometrics.sex + ', ' : ''}${biometrics.age}yo, ${biometrics.heightCm}cm, ${biometrics.weightKg}kg) and training ${trainingDays}x/week`
      : `your training frequency (${trainingDays}x/week) and experience level`;

    const rationale = templateRationale(goal, targets.calorieAdjustment, biometricsDescription);

    return NextResponse.json({
      ...targets,
      goalLabel: GOAL_LABEL[goal],
      rationale,
    });
  } catch (err) {
    console.error('[nutrition-targets] Error:', err);
    return NextResponse.json({ error: 'Failed to calculate nutrition targets' }, { status: 500 });
  }
}
