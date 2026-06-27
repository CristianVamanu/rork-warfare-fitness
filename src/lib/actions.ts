/**
 * Central state update layer.
 *
 * ALL activity tracking must go through these functions.
 * Each action:
 *   1. Writes the canonical collection document (for list/history reads)
 *   2. Emits an event via createEvent() (for stats derivation)
 *
 * Direct stat mutation on the user doc is forbidden outside this file.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { createEvent } from './events';
import type { EventType } from '@/types';

// ---------------------------------------------------------------------------
// Internal helpers
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
) {
  return createEvent({ type, userId, trainerId, payload });
}

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------

interface SetLog { weight: number; reps: number; completed: boolean }
interface ExerciseLog { name: string; sets: SetLog[] }

/**
 * Complete a workout:
 *   - writes to workoutLogs (history reads)
 *   - emits WORKOUT_COMPLETED event (stats derivation)
 */
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

  // 1. Write canonical workout log
  const logRef = await addDoc(collection(db, 'workoutLogs'), {
    userId,
    trainerId,
    programId: programId ?? null,
    exercises,
    duration,
    calories,
    completedAt: serverTimestamp(),
  });

  // 2. Emit event for stats derivation
  await emit('WORKOUT_COMPLETED', userId, trainerId, {
    workoutLogId: logRef.id,
    programId: programId ?? null,
    exerciseCount: exercises.length,
    totalWeightLifted,
    duration,
    calories,
  });

  // 3. Touch lastActive (non-blocking)
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

  // 1. Write canonical meal doc
  const mealRef = await addDoc(collection(db, 'meals'), {
    userId,
    trainerId,
    ...meal,
    loggedAt: serverTimestamp(),
  });

  // 2. Emit event
  await emit('MEAL_LOGGED', userId, trainerId, { mealId: mealRef.id, ...meal });

  // 3. Touch lastActive (non-blocking)
  updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Nutrition — water
// ---------------------------------------------------------------------------

export async function logWaterAction(userId: string, amountMl: number): Promise<void> {
  const trainerId = await getTrainerId(userId);

  // 1. Write canonical water log doc
  const waterRef = await addDoc(collection(db, 'waterLogs'), {
    userId,
    trainerId,
    amountMl,
    loggedAt: serverTimestamp(),
  });

  // 2. Emit event
  await emit('WATER_LOGGED', userId, trainerId, { waterLogId: waterRef.id, amountMl });

  // 3. Touch lastActive (non-blocking)
  updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Body weight
// ---------------------------------------------------------------------------

export async function recordWeight(userId: string, weightKg: number): Promise<void> {
  const trainerId = await getTrainerId(userId);

  await addDoc(collection(db, 'weightLogs'), {
    userId,
    trainerId,
    weightKg,
    loggedAt: serverTimestamp(),
  });

  await emit('WEIGHT_RECORDED', userId, trainerId, { weightKg });

  updateDoc(doc(db, 'users', userId), {
    lastActive: serverTimestamp(),
    currentWeightKg: weightKg,
  }).catch(console.error);
}
