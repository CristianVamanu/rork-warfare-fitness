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
import { auth, db } from './firebase';
import { createEvent } from './events';
import { incrementProgramWorkouts } from './firestore';
import { calcWorkoutXP, xpToPowerLevel } from './xp';
import { checkAndAwardAchievements, ACHIEVEMENT_DEFS } from './achievements';
import { checkAndAwardQuests } from './quests';
import type { EventType } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTrainerId(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', userId));
  return (snap.data()?.trainerId as string) ?? 'unknown';
}

function sendAchievementEmail(achievementIds: string[]): void {
  if (achievementIds.length === 0 || !auth.currentUser) return;
  const titles = achievementIds
    .map((id) => ACHIEVEMENT_DEFS.find((d) => d.id === id)?.title)
    .filter((t): t is string => !!t);
  if (titles.length === 0) return;
  auth.currentUser.getIdToken().then((token) => {
    fetch('/api/email/achievement', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles }),
    }).catch(() => {
      // Non-fatal — achievement email is best-effort
    });
  }).catch(() => {
    // Non-fatal
  });
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

interface SetLog {
  weight: number; reps: number; completed: boolean;
  // Only present for distance-mode sets (ruck marches, timed runs) — see
  // parseDistance() in the training session page.
  distanceValue?: number; distanceUnit?: 'mi' | 'km'; elapsedSeconds?: number;
}
interface ExerciseLog { name: string; sets: SetLog[] }

export interface WorkoutResult {
  xpEarned: number;
  newAchievements: string[];
  newPowerLevel: number;
  newQuests: string[];
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

  // Awaited (not fire-and-forget) so a fast navigation right after finishing
  // a workout can't cancel this write mid-flight and silently drop progress —
  // dayIndex prevents counting repeats of the same day.
  if (programId) {
    await incrementProgramWorkouts(userId, dayIndex).catch(console.error);
  }

  // Update XP + powerLevel
  let newPowerLevel = 0;
  let newAchievements: string[] = [];
  let newQuests: string[] = [];

  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const data = snap.data() ?? {};
    const prevXP = (data.xp as number) ?? 0;
    const totalXP = prevXP + xpEarned;
    newPowerLevel = xpToPowerLevel(totalXP);

    const statsCache = data.statsCache as Record<string, number> | undefined;
    const totalWorkouts = (statsCache?.totalWorkouts ?? (data.stats as Record<string, number>)?.totalWorkouts ?? 0) + 1;
    const streak = statsCache?.streak ?? (data.stats as Record<string, number>)?.streak ?? 0;

    const now = new Date();
    const workoutHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

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

    // Check achievements after updating power level — use newStreak (the
    // value just computed for this workout), not the pre-workout `streak`,
    // otherwise a streak-gated achievement/quest (e.g. "5 days in a row")
    // only fires a day late, once today's newStreak becomes tomorrow's
    // stale `streak` read.
    newAchievements = await checkAndAwardAchievements(userId, {
      totalWorkouts,
      streak: newStreak,
      powerLevel: newPowerLevel,
      workoutHour,
      isWeekend,
    });
    sendAchievementEmail(newAchievements);

    const prevTotalWeightLifted = (data.stats as Record<string, number> | undefined)?.totalWeightLifted ?? 0;
    const totalMealsLogged = (data.stats as Record<string, number> | undefined)?.totalMealsLogged ?? 0;
    newQuests = await checkAndAwardQuests(userId, {
      totalWorkouts,
      streak: newStreak,
      powerLevel: newPowerLevel,
      totalWeightLifted: prevTotalWeightLifted + totalWeightLifted,
      totalMealsLogged,
    });
  } catch (err) {
    console.error('[Actions] XP/Achievement update failed:', err);
  }

  return { xpEarned, newAchievements, newPowerLevel, newQuests };
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

  const snap = await getDoc(doc(db, 'users', userId));
  const data = snap.data() ?? {};
  const prevStats = data.stats as Record<string, number> | undefined;
  const totalMealsLogged = (prevStats?.totalMealsLogged ?? 0) + 1;

  // Award meal achievements + check quests non-blocking
  checkAndAwardAchievements(userId, {
    totalWorkouts: 0,
    streak: 0,
    powerLevel: 0,
    hasLoggedMeal: true,
    totalMealsLogged,
  }).then(sendAchievementEmail).catch(console.error);

  checkAndAwardQuests(userId, {
    totalWorkouts: prevStats?.totalWorkouts ?? 0,
    streak: (data.statsCache as Record<string, number> | undefined)?.streak ?? prevStats?.streak ?? 0,
    powerLevel: (data.powerLevel as number) ?? 0,
    totalWeightLifted: prevStats?.totalWeightLifted ?? 0,
    totalMealsLogged,
  }).catch(console.error);

  // updateDoc (not setDoc+merge) — setDoc+merge treats a dotted string key
  // like 'stats.totalMealsLogged' as a literal field name rather than a
  // nested path, silently writing to the wrong place. Only updateDoc
  // reliably resolves dotted paths to nested fields.
  updateDoc(doc(db, 'users', userId), {
    lastActive: serverTimestamp(),
    'stats.totalMealsLogged': totalMealsLogged,
  }).catch(console.error);
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
