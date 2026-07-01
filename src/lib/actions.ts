/**
 * Central state update layer.
 *
 * ALL activity tracking must go through these functions.
 * Each action emits an event via createEvent() — the single write path.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { createEvent } from './events';
import { incrementProgramWorkouts } from './firestore';
import { calcWorkoutXP, xpToPowerLevel } from './xp';
import { checkAndAwardAchievements } from './achievements';
import type { EventType } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTrainerId(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', userId));
  return (snap.data()?.trainerId as string) ?? 'unknown';
}

async function emit(
  type: EventType,
  userId: string,
  trainerId: string,
  payload: Record<string, unknown>
): Promise<string> {
  return createEvent({ type, userId, trainerId, payload });
}

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------

interface SetLog { weight: number; reps: number; completed: boolean }
interface ExerciseLog { name: string; sets: SetLog[] }

export interface WorkoutResult {
  xpEarned: number;
  newAchievements: string[];
  newPowerLevel: number;
}

export async function completeWorkout(
  userId: string,
  exercises: ExerciseLog[],
  duration: number,
  programId?: string,
  dayIndex?: number,
): Promise<WorkoutResult> {
  const trainerId = await getTrainerId(userId);

  const completedSets = exercises.reduce(
    (s, ex) => s + ex.sets.filter((st) => st.completed).length, 0
  );
  const totalWeightLifted = exercises.reduce(
    (sum, ex) =>
      sum + ex.sets
        .filter((s) => s.completed)
        .reduce((s2, s) => s2 + s.weight * s.reps, 0),
    0
  );
  const calories = Math.round(duration * 8);
  const xpEarned = calcWorkoutXP(duration, completedSets, totalWeightLifted);

  await emit('WORKOUT_COMPLETED', userId, trainerId, {
    programId: programId ?? null,
    exerciseCount: exercises.length,
    exercises,
    totalWeightLifted,
    duration,
    calories,
    xpEarned,
  });

  // Non-blocking program progress increment (dayIndex prevents counting repeats)
  if (programId) {
    incrementProgramWorkouts(userId, dayIndex).catch(console.error);
  }

  // Update XP + powerLevel
  let newPowerLevel = 0;
  let newAchievements: string[] = [];

  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const data = snap.data() ?? {};
    const prevXP = (data.xp as number) ?? 0;
    const totalXP = prevXP + xpEarned;
    newPowerLevel = xpToPowerLevel(totalXP);

    const statsCache = data.statsCache as Record<string, number> | undefined;
    const totalWorkouts = (statsCache?.totalWorkouts ?? (data.stats as Record<string, number>)?.totalWorkouts ?? 0) + 1;
    const streak = statsCache?.streak ?? (data.stats as Record<string, number>)?.streak ?? 0;

    const workoutHour = new Date().getHours();

    await setDoc(doc(db, 'users', userId), {
      xp: totalXP,
      powerLevel: newPowerLevel,
      lastActive: serverTimestamp(),
    }, { merge: true });

    // Eagerly update statsCache so the dashboard reflects changes immediately
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
    const lastWorkoutDate = (statsCache as Record<string, unknown> | undefined)?.lastWorkoutDate as string | undefined;
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
    let newStreak: number;
    if (lastWorkoutDate === today) {
      newStreak = streak; // same day — streak unchanged
    } else if (lastWorkoutDate === yesterday) {
      newStreak = streak + 1; // consecutive day — extend streak
    } else {
      newStreak = 1; // gap or first workout — start at 1
    }

    updateDoc(doc(db, 'users', userId), {
      'statsCache.totalWorkouts': increment(1),
      'statsCache.streak': newStreak,
      'statsCache.lastWorkoutDate': today,
      'statsCache.cacheDate': today,
      'stats.totalWeightLifted': increment(totalWeightLifted),
      'stats.totalWorkouts': increment(1),
    }).catch(() => {
      // Non-critical; background recompute will self-correct
    });

    // Check achievements after updating power level
    newAchievements = await checkAndAwardAchievements(userId, {
      totalWorkouts,
      streak,
      powerLevel: newPowerLevel,
      workoutHour,
    });
  } catch (err) {
    console.error('[Actions] XP/Achievement update failed:', err);
  }

  return { xpEarned, newAchievements, newPowerLevel };
}

// ---------------------------------------------------------------------------
// Nutrition — meals
// ---------------------------------------------------------------------------

export async function logMealAction(
  userId: string,
  meal: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  }
): Promise<void> {
  const trainerId = await getTrainerId(userId);
  await emit('MEAL_LOGGED', userId, trainerId, { ...meal });

  // Award meal achievement non-blocking
  checkAndAwardAchievements(userId, {
    totalWorkouts: 0,
    streak: 0,
    powerLevel: 0,
    hasLoggedMeal: true,
  }).catch(console.error);

  setDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }, { merge: true }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Nutrition — water
// ---------------------------------------------------------------------------

export async function logWaterAction(userId: string, amountMl: number): Promise<void> {
  const trainerId = await getTrainerId(userId);
  await emit('WATER_LOGGED', userId, trainerId, { amountMl });
  setDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }, { merge: true }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Body weight
// ---------------------------------------------------------------------------

export async function recordWeight(userId: string, weightKg: number): Promise<void> {
  const trainerId = await getTrainerId(userId);
  await emit('WEIGHT_RECORDED', userId, trainerId, { weightKg });
  setDoc(doc(db, 'users', userId), {
    lastActive: serverTimestamp(),
    currentWeightKg: weightKg,
  }, { merge: true }).catch(console.error);
}
