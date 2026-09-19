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
import { lbsToKg } from '@/lib/utils';
import { auth, db } from './firebase';
import { createEvent } from './events';
import { incrementProgramWorkouts, updateUserGoals, postCommunityActivity, invalidateWorkoutsCache } from './firestore';
import { calcWorkoutXP, xpToPowerLevel } from './xp';
import { estimateNutritionTargets } from './tdee';
import { checkAndAwardAchievements, ACHIEVEMENT_DEFS } from './achievements';
import { checkAndAwardQuests, QUEST_DEFS } from './quests';
import type { EventType, FitnessGoal, ExperienceLevel, OnboardingData } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTrainerId(userId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', userId));
  return (snap.data()?.trainerId as string) ?? 'unknown';
}

// Live Activity posts need the athlete's own display name — reads once and
// falls back to a neutral label rather than blocking/failing the workout
// completion if the profile read is slow/unavailable.
async function getDisplayName(userId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    return (snap.data()?.displayName as string) || 'A member';
  } catch {
    return 'A member';
  }
}

// ---------------------------------------------------------------------------
// Live Activity posts — see postCommunityActivity in firestore.ts for the
// privacy rationale (public, field-limited, never the raw event payload).
// ---------------------------------------------------------------------------

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365];

async function postWorkoutActivity(userId: string, programResult: import('./firestore').ProgramProgressResult | undefined): Promise<void> {
  const displayName = await getDisplayName(userId);
  if (programResult?.justFinishedProgram) {
    postCommunityActivity(userId, displayName, 'program_completed', `completed ${programResult.programName || 'a training program'}`);
  } else if (programResult) {
    postCommunityActivity(userId, displayName, 'program_day', `completed ${programResult.programName || 'their program'} — Day ${programResult.dayIndex + 1}`);
  } else {
    postCommunityActivity(userId, displayName, 'workout', "completed today's workout");
  }
}

async function postStreakMilestoneActivity(userId: string, streak: number): Promise<void> {
  const displayName = await getDisplayName(userId);
  postCommunityActivity(userId, displayName, 'streak', `reached a ${streak}-day streak`);
}

async function postAchievementActivities(userId: string, achievementIds: string[]): Promise<void> {
  const displayName = await getDisplayName(userId);
  for (const id of achievementIds) {
    const title = ACHIEVEMENT_DEFS.find((d) => d.id === id)?.title;
    if (title) postCommunityActivity(userId, displayName, 'achievement', `earned ${title}`);
  }
}

async function postQuestActivities(userId: string, questIds: string[]): Promise<void> {
  const displayName = await getDisplayName(userId);
  for (const id of questIds) {
    const title = QUEST_DEFS.find((d) => d.id === id)?.title;
    if (title) postCommunityActivity(userId, displayName, 'quest', `completed a quest — ${title}`);
  }
}

function sendAchievementEmail(achievementIds: string[]): void {
  if (achievementIds.length === 0 || !auth.currentUser) return;
  const validIds = achievementIds.filter((id) => ACHIEVEMENT_DEFS.some((d) => d.id === id));
  if (validIds.length === 0) return;
  // Sending the ids (not titles) so the server derives the display text
  // itself from ACHIEVEMENT_DEFS — a client could otherwise send arbitrary
  // strings straight into the email as if they were real achievement titles.
  auth.currentUser.getIdToken().then((token) => {
    fetch('/api/email/achievement', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ achievementIds: validIds }),
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
  // The weights inside `exercises` are entered (and stored, for history/
  // suggestion display) in whichever unit the user currently has selected —
  // never normalized. Left alone, that means `stats.totalWeightLifted` (a
  // single running total accumulated across every workout ever logged) mixes
  // kg and lbs entries depending on the unit active at the time, and quest
  // thresholds like "Lift 100,000kg" (titan.ts) end up comparing kg targets
  // against a number that might actually be ~2.2x too small or too large.
  // Converting the AGGREGATE figure to kg here (not the per-set numbers,
  // which stay unit-native for history/suggestion display elsewhere) fixes
  // this going forward; it can't retroactively fix totals already
  // accumulated from past lbs-unit workouts without a data migration.
  weightUnit: 'kg' | 'lbs' = 'kg',
): Promise<WorkoutResult> {
  const trainerId = await getTrainerId(userId);

  const completedSets = exercises.reduce(
    (s, ex) => s + ex.sets.filter((st) => st.completed).length, 0
  );
  const totalWeightLiftedRaw = exercises.reduce(
    (sum, ex) =>
      sum + ex.sets
        .filter((s) => s.completed)
        .reduce((s2, s) => s2 + s.weight * s.reps, 0),
    0
  );
  const totalWeightLifted = weightUnit === 'lbs' ? lbsToKg(totalWeightLiftedRaw) : totalWeightLiftedRaw;
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

  // The recent-workout list this user just changed is now stale — drop it so
  // the dashboard's next read reflects the workout that was just finished
  // instead of serving the pre-workout list out of the short-lived cache.
  invalidateWorkoutsCache();

  // Awaited (not fire-and-forget) so a fast navigation right after finishing
  // a workout can't cancel this write mid-flight and silently drop progress —
  // dayIndex prevents counting repeats of the same day.
  let programResult: import('./firestore').ProgramProgressResult | undefined;
  if (programId) {
    programResult = await incrementProgramWorkouts(userId, dayIndex, programId).catch((err) => { console.error(err); return undefined; });
  }

  // Update XP + powerLevel
  let newPowerLevel = 0;
  let newAchievements: string[] = [];
  let newQuests: string[] = [];
  let streakAdvanced = false;

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
    let totalXP = 0;

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
      totalXP = prevXP + xpEarned;
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
        streakAdvanced = true;
      } else {
        newStreak = 1; // gap or first workout — start at 1
        streakAdvanced = true;
      }

      tx.set(userRef, {
        xp: totalXP,
        powerLevel: newPowerLevel,
        lastActive: serverTimestamp(),
        // streak and totalWorkouts deliberately NOT written here —
        // recomputeStatsCache (already triggered by emit()/createEvent()
        // above) independently derives both from the actual event history
        // (totalWorkouts by counting WORKOUT_COMPLETED docs, streak with its
        // freeze logic), and its write used to race this one: whichever
        // finished last won, so this transaction's own incremental count —
        // based on a merge write, not a true increment() — could stomp a
        // more current value recomputeStatsCache had just derived, or vice
        // versa. Both local vars are still computed above and used for the
        // immediate achievement/quest checks below, which need a value
        // synchronously rather than waiting on that async recompute — they
        // just aren't persisted from two places anymore.
        statsCache: {
          ...(statsCache ?? {}),
          lastWorkoutDate: today,
          cacheDate: today,
        },
        stats: {
          ...(data.stats as Record<string, unknown> ?? {}),
          totalWeightLifted: ((data.stats as Record<string, number>)?.totalWeightLifted ?? 0) + totalWeightLifted,
        },
      }, { merge: true });
    });

    // Mirror the leaderboard-relevant subset onto the public, field-limited
    // doc other users are actually allowed to read (see firestore.rules —
    // `users/{uid}` is locked to owner + admin/own-trainer). Streak and
    // totalWorkouts are deliberately excluded, matching statsCache above —
    // synced solely by recomputeStatsCache to avoid the same race. Moved
    // outside the transaction — a runTransaction callback can retry on write
    // conflict, and this call has its own non-transactional side effect
    // (writing a separate document), which would otherwise fire once per
    // retry attempt instead of exactly once per completed workout.
    // The public leaderboard was removed: ranking members against each other
    // on self-reported workouts rewarded whoever logged the most fiction, not
    // whoever trained. XP and power level remain as personal progression on
    // the user document; nothing mirrors them to a public collection now.

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

    // Live Activity — best-effort, never blocks the workout result. One
    // post per meaningful thing that happened this call: the workout/
    // program-day/program-completion itself (mutually exclusive — never
    // more than one of these three), any newly-crossed streak milestone,
    // and one per newly-earned achievement/quest.
    postWorkoutActivity(userId, programResult).catch(() => {});
    if (streakAdvanced && STREAK_MILESTONES.includes(newStreak)) {
      postStreakMilestoneActivity(userId, newStreak).catch(() => {});
    }
    if (newAchievements.length > 0) postAchievementActivities(userId, newAchievements).catch(() => {});
    if (newQuests.length > 0) postQuestActivities(userId, newQuests).catch(() => {});
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
