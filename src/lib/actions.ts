/**
 * Central state update layer.
 * All writes that affect user stats, streak, or lastActive go through here.
 * Pages import from this file — not directly from firestore.ts — for anything
 * that must update user state alongside the core write.
 */

import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

interface SetLog { weight: number; reps: number; completed: boolean }
interface ExerciseLog { name: string; sets: SetLog[] }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeNewStreak(lastWorkoutTimestamp: unknown, currentStreak: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!lastWorkoutTimestamp) return 1;

  let lastDate: Date;
  if (lastWorkoutTimestamp instanceof Timestamp) {
    lastDate = lastWorkoutTimestamp.toDate();
  } else if (typeof lastWorkoutTimestamp === 'string' || typeof lastWorkoutTimestamp === 'number') {
    lastDate = new Date(lastWorkoutTimestamp);
  } else {
    return 1;
  }
  lastDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today.getTime() - lastDate.getTime()) / 86_400_000);

  if (diffDays === 0) return currentStreak;   // already worked out today
  if (diffDays === 1) return currentStreak + 1; // consecutive day
  return 1;                                    // missed ≥1 day — reset
}

async function touchLastActive(userId: string) {
  await updateDoc(doc(db, 'users', userId), { lastActive: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/**
 * Complete a workout: write workoutLog, update totalWorkouts,
 * totalWeightLifted, streak, lastWorkoutDate, lastActive.
 */
export async function completeWorkout(
  userId: string,
  exercises: ExerciseLog[],
  duration: number,
  programId?: string
): Promise<void> {
  // 1. Write the workout log
  await addDoc(collection(db, 'workoutLogs'), {
    userId,
    programId: programId ?? null,
    exercises,
    duration,
    calories: Math.round(duration * 8),
    completedAt: serverTimestamp(),
  });

  // 2. Read current user data once for stats + streak
  const userSnap = await getDoc(doc(db, 'users', userId));
  const userData = userSnap.data() ?? {};
  const stats = (userData.stats as Record<string, number>) ?? {};

  const totalWeightThisSession = exercises.reduce(
    (sum, ex) =>
      sum + ex.sets.filter((s) => s.completed).reduce((s2, s) => s2 + s.weight * s.reps, 0),
    0
  );

  const newStreak = computeNewStreak(userData.lastWorkoutDate, stats.streak ?? 0);

  // 3. Atomic stats + streak update
  await updateDoc(doc(db, 'users', userId), {
    'stats.totalWorkouts': (stats.totalWorkouts ?? 0) + 1,
    'stats.totalWeightLifted': (stats.totalWeightLifted ?? 0) + totalWeightThisSession,
    'stats.streak': newStreak,
    lastWorkoutDate: serverTimestamp(),
    lastActive: serverTimestamp(),
  });
}

/**
 * Log a meal and touch lastActive.
 */
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
) {
  const ref = await addDoc(collection(db, 'meals'), {
    userId,
    ...meal,
    loggedAt: serverTimestamp(),
  });
  await touchLastActive(userId);
  return ref;
}

/**
 * Log water and touch lastActive.
 */
export async function logWaterAction(userId: string, amountMl: number) {
  const ref = await addDoc(collection(db, 'waterLogs'), {
    userId,
    amountMl,
    loggedAt: serverTimestamp(),
  });
  await touchLastActive(userId);
  return ref;
}
