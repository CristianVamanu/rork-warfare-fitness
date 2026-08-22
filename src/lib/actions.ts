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
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { DistanceUnit } from '@/lib/distance';
import { auth, db } from './firebase';
import { createEvent } from './events';
import { incrementProgramWorkouts, syncLeaderboardPublic, updateUserGoals } from './firestore';
import { calcWorkoutXP, xpToPowerLevel } from './xp';
import { estimateNutritionTargets } from './tdee';
import { checkAndAwardAchievements, ACHIEVEMENT_DEFS } from './achievements';
import { checkAndAwardQuests } from './quests';
import type { EventType, FitnessGoal, ExperienceLevel, OnboardingData } from '@/types';

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
  payload: Record<string, unknown>,
  createdAt?: Date
): Promise<string> {
  return createEvent({ type, userId, trainerId, payload, createdAt });
}

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------

interface SetLog {
  weight: number; reps: number; completed: boolean;
  // Only present for distance-mode sets (ruck marches, timed runs) — see
  // parseDistance() in the training session page.
  distanceValue?: number; distanceUnit?: DistanceUnit; elapsedSeconds?: number;
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
    await incrementProgramWorkouts(userId, dayIndex, programId).catch(console.error);
  }

  // Update XP + powerLevel
  let newPowerLevel = 0;
  let newAchievements: string[] = [];
  let newQuests: string[] = [];

  try {
    const now = new Date();
    const workoutHour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');

    let totalWorkouts = 0;
    let newStreak = 1;
    let prevTotalWeightLifted = 0;
    let totalMealsLogged = 0;

    // Wrapped in a transaction so two workouts finished in quick succession
    // (double-tap "finish", two open tabs) can't both read the same
    // pre-write xp/streak and independently overwrite each other — the
    // transaction re-reads and retries automatically on write conflict,
    // so both completions' XP/streak deltas are always preserved.
    const userRef = doc(db, 'users', userId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data() ?? {};
      const prevXP = (data.xp as number) ?? 0;
      const totalXP = prevXP + xpEarned;
      newPowerLevel = xpToPowerLevel(totalXP);

      const statsCache = data.statsCache as Record<string, number> | undefined;
      const prevStats = data.stats as Record<string, number> | undefined;
      totalWorkouts = (statsCache?.totalWorkouts ?? prevStats?.totalWorkouts ?? 0) + 1;
      const streak = statsCache?.streak ?? prevStats?.streak ?? 0;
      const lastWorkoutDate = (statsCache as Record<string, unknown> | undefined)?.lastWorkoutDate as string | undefined;
      prevTotalWeightLifted = prevStats?.totalWeightLifted ?? 0;
      totalMealsLogged = prevStats?.totalMealsLogged ?? 0;

      if (lastWorkoutDate === today) {
        newStreak = streak; // same day — streak unchanged
      } else if (lastWorkoutDate === yesterday) {
        newStreak = streak + 1; // consecutive day — extend streak
      } else {
        newStreak = 1; // gap or first workout — start at 1
      }

      tx.set(userRef, {
        xp: totalXP,
        powerLevel: newPowerLevel,
        lastActive: serverTimestamp(),
        // streak deliberately NOT written here — recomputeStatsCache
        // (already triggered by emit()/createEvent() above) independently
        // computes it from the full 60-day event history with freeze
        // logic, and its write used to race this one: whichever finished
        // last won, so a freeze-extended streak could get silently reset
        // by this simpler incremental calculation completing after it.
        // newStreak is still computed above and used for the immediate
        // achievement/quest checks below, which need a value synchronously
        // rather than waiting on that async recompute — it's just no
        // longer persisted from two places.
        statsCache: {
          ...(statsCache ?? {}),
          totalWorkouts,
          lastWorkoutDate: today,
          cacheDate: today,
        },
        stats: {
          ...(data.stats as Record<string, unknown> ?? {}),
          totalWeightLifted: ((data.stats as Record<string, number>)?.totalWeightLifted ?? 0) + totalWeightLifted,
          totalWorkouts,
        },
      }, { merge: true });

      // Mirror the leaderboard-relevant subset onto the public, field-limited
      // doc other users are actually allowed to read (see firestore.rules —
      // `users/{uid}` is locked to owner + admin/own-trainer). Streak is
      // deliberately excluded, matching statsCache above — it's synced solely
      // by recomputeStatsCache to avoid the same race.
      void syncLeaderboardPublic(userId, {
        xp: totalXP,
        powerLevel: newPowerLevel,
        totalWorkouts,
        totalWeightLifted: prevTotalWeightLifted + totalWeightLifted,
        lastWorkoutDate: today,
      });
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
  },
  loggedAt?: Date
): Promise<void> {
  const trainerId = await getTrainerId(userId);
  await emit('MEAL_LOGGED', userId, trainerId, { ...meal }, loggedAt);

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
  //
  // increment(1) (not the locally-computed totalMealsLogged literal) so two
  // meals logged back-to-back can't race on the same pre-write read and
  // have the second write clobber the first's count instead of adding to
  // it — increment() is a server-side atomic op, immune to that.
  updateDoc(doc(db, 'users', userId), {
    lastActive: serverTimestamp(),
    'stats.totalMealsLogged': increment(1),
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

  // Weight is a direct input to the BMR calculation nutrition targets are
  // derived from — without recalculating here, calorie/macro goals set once
  // at onboarding silently drift out of date as the user's weight changes,
  // no matter how long they keep logging weigh-ins.
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const data = snap.data();
    const goal = data?.fitnessGoal as FitnessGoal | undefined;
    const experience = data?.experience as ExperienceLevel | undefined;
    const onboarding = data?.onboarding as OnboardingData | undefined;
    const trainingDays = onboarding?.trainingDays;
    if (goal && experience && trainingDays) {
      const biometrics = onboarding?.sex && onboarding?.age && onboarding?.heightCm
        ? { sex: onboarding.sex, age: onboarding.age, heightCm: onboarding.heightCm, weightKg }
        : undefined;
      const targets = estimateNutritionTargets(goal, experience, trainingDays, biometrics);
      await updateUserGoals(userId, {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
        water: targets.water,
      });
    }
  } catch (err) {
    console.error('[Actions] Nutrition target recalc failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Taste-then-paywall
// ---------------------------------------------------------------------------

/** Marks a locked AI tool's one-time free taste as used — call only after an
 * actual successful result, not just for opening the page. */
export async function consumeAiTaste(userId: string, feature: string): Promise<void> {
  await setDoc(doc(db, 'users', userId), {
    aiTaste: { [feature]: true },
  }, { merge: true });
}
