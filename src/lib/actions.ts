/**
 * Central state update layer.
 *
 * ALL activity tracking must go through these functions.
 * Each action emits an event via createEvent() — the single write path.
 * Legacy collection (meals / waterLogs / workoutLogs) writes are DISABLED.
 * Reads from those collections are for migration purposes only.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { createEvent } from './events';
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

export async function completeWorkout(
  userId: string,
  exercises: ExerciseLog[],
  duration: number,
  programId?: string
): Promise<void> {
  const trainerId = await getTrainerId(userId);

  const calories = Math.round(duration * 8);
  const totalWeightLifted = exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets
        .filter((s) => s.completed)
        .reduce((s2, s) => s2 + s.weight * s.reps, 0),
    0
  );

  await emit('WORKOUT_COMPLETED', userId, trainerId, {
    programId: programId ?? null,
    exerciseCount: exercises.length,
    exercises, // store full exercise log in payload for history reads
    totalWeightLifted,
    duration,
    calories,
  });

  updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }).catch(console.error);
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

  updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Nutrition — water
// ---------------------------------------------------------------------------

export async function logWaterAction(userId: string, amountMl: number): Promise<void> {
  const trainerId = await getTrainerId(userId);

  await emit('WATER_LOGGED', userId, trainerId, { amountMl });

  updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Body weight
// ---------------------------------------------------------------------------

export async function recordWeight(userId: string, weightKg: number): Promise<void> {
  const trainerId = await getTrainerId(userId);

  await emit('WEIGHT_RECORDED', userId, trainerId, { weightKg });

  updateDoc(doc(db, 'users', userId), {
    lastActive: serverTimestamp(),
    currentWeightKg: weightKg,
  }).catch(console.error);
}
