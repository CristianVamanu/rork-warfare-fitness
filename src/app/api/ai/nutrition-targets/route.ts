export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns an athlete's calorie/macro targets right after onboarding.
 *
 * The numbers themselves (BMR, maintenance, target, macros) are computed
 * deterministically in tdee.ts via Mifflin-St Jeor — arithmetic like this
 * needs to be exactly right every time, and an LLM asked to "calculate"
 * calories is liable to hallucinate plausible-looking wrong numbers. What
 * OpenAI actually adds here is the short, personalized coaching note
 * explaining *why* those numbers are the target — that's a writing task,
 * not a math one. If OpenAI isn't configured, a solid template sentence
 * fills in instead so onboarding never blocks on this.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
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

    let rationale = templateRationale(goal, targets.calorieAdjustment, biometricsDescription);

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
        const res = await openai.chat.completions.create({
          model,
          max_tokens: 90,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: 'You are a sports nutrition coach. Write exactly one encouraging, specific sentence (max 32 words) explaining an athlete\'s calorie target. State the deficit/surplus/maintenance number and why it fits their goal. No greetings, no disclaimers, no markdown — plain text only.',
            },
            {
              role: 'user',
              content: `Goal: ${GOAL_LABEL[goal]}. Maintenance calories: ${targets.maintenanceCalories}. Target calories: ${targets.calories} (${targets.calorieAdjustment >= 0 ? '+' : ''}${targets.calorieAdjustment} vs maintenance). Based on ${biometricsDescription}.`,
            },
          ],
        });
        const text = res.choices[0]?.message?.content?.trim();
        if (text) rationale = text;
      } catch (err) {
        console.error('[nutrition-targets] OpenAI rationale failed, using template:', err);
      }
    }

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
