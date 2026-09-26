/**
 * Data migration layer.
 *
 * Backfills the events collection from legacy data (meals, waterLogs,
 * workoutLogs) that existed before the event-driven architecture was
 * introduced. Safe to call multiple times — idempotent via
 * users/{uid}.migrationCompletedAt flag.
 *
 * Flow on login:
 *   checkAndRunMigration(uid) → migrateLegacyUserData(uid) → rebuildStatsCache(uid)
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { recomputeStatsCache } from './events';
import type { EventType } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTrainerId(userId: string, userTrainerId?: string): Promise<string> {
  if (userTrainerId) return userTrainerId;
  try {
    const snap = await getDoc(doc(db, 'system', 'config'));
    const tid = snap.data()?.trainerId as string | undefined;
    if (tid) return tid;
  } catch { /* ignore */ }
  return 'unknown';
}

/** Returns set of sourceIds already covered by existing events (dedup guard). */
async function getExistingSourceIds(userId: string, type: EventType): Promise<Set<string>> {
  const snap = await getDocs(
    query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('type', '==', type)
    )
  );
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const sourceId = d.data().sourceId as string | undefined;
    if (sourceId) ids.add(sourceId);
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Core migration
// ---------------------------------------------------------------------------

export interface MigrationResult {
  alreadyMigrated: boolean;
  mealsCreated: number;
  waterCreated: number;
  workoutsCreated: number;
  totalEventsCreated: number;
}

/**
 * Migrates all legacy collection documents for a user into the events
 * collection. Marks user doc with migrationCompletedAt when done.
 */
export async function migrateLegacyUserData(userId: string): Promise<MigrationResult> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  const userData = userSnap.data() ?? {};

  // Idempotency — skip if already migrated
  if (userData.migrationCompletedAt) {
    return {
      alreadyMigrated: true,
      mealsCreated: 0,
      waterCreated: 0,
      workoutsCreated: 0,
      totalEventsCreated: 0,
    };
  }

  const trainerId = await resolveTrainerId(userId, userData.trainerId as string | undefined);
  let mealsCreated = 0;
  let waterCreated = 0;
  let workoutsCreated = 0;

  // ── Meals ────────────────────────────────────────────────────────────────
  const existingMealSources = await getExistingSourceIds(userId, 'MEAL_LOGGED');
  const mealsSnap = await getDocs(
    query(collection(db, 'meals'), where('userId', '==', userId))
  );
  for (const d of mealsSnap.docs) {
    if (existingMealSources.has(d.id)) continue;
    const data = d.data();
    await addDoc(collection(db, 'events'), {
      type: 'MEAL_LOGGED',
      userId,
      trainerId,
      sourceId: d.id, // original meals/{id} — used for dedup on re-run
      payload: {
        mealId: d.id,
        name: data.name ?? '',
        calories: data.calories ?? 0,
        protein: data.protein ?? 0,
        carbs: data.carbs ?? 0,
        fat: data.fat ?? 0,
        mealType: data.mealType ?? 'snack',
      },
      // Preserve original timestamp so today-filters work correctly
      createdAt: data.loggedAt instanceof Timestamp ? data.loggedAt : serverTimestamp(),
    });
    mealsCreated++;
  }

  // ── Water logs ───────────────────────────────────────────────────────────
  const existingWaterSources = await getExistingSourceIds(userId, 'WATER_LOGGED');
  const waterSnap = await getDocs(
    query(collection(db, 'waterLogs'), where('userId', '==', userId))
  );
  for (const d of waterSnap.docs) {
    if (existingWaterSources.has(d.id)) continue;
    const data = d.data();
    await addDoc(collection(db, 'events'), {
      type: 'WATER_LOGGED',
      userId,
      trainerId,
      sourceId: d.id,
      payload: {
        waterLogId: d.id,
        amountMl: data.amountMl ?? 0,
      },
      createdAt: data.loggedAt instanceof Timestamp ? data.loggedAt : serverTimestamp(),
    });
    waterCreated++;
  }

  // ── Workout logs ─────────────────────────────────────────────────────────
  const existingWorkoutSources = await getExistingSourceIds(userId, 'WORKOUT_COMPLETED');
  const workoutsSnap = await getDocs(
    query(collection(db, 'workoutLogs'), where('userId', '==', userId))
  );
  for (const d of workoutsSnap.docs) {
    if (existingWorkoutSources.has(d.id)) continue;
    const data = d.data();
    await addDoc(collection(db, 'events'), {
      type: 'WORKOUT_COMPLETED',
      userId,
      trainerId,
      sourceId: d.id,
      payload: {
        workoutLogId: d.id,
        programId: data.programId ?? null,
        duration: data.duration ?? 0,
        calories: data.calories ?? 0,
        exerciseCount: Array.isArray(data.exercises) ? data.exercises.length : 0,
        totalWeightLifted: 0, // not available in legacy format
      },
      createdAt: data.completedAt instanceof Timestamp ? data.completedAt : serverTimestamp(),
    });
    workoutsCreated++;
  }

  const totalEventsCreated = mealsCreated + waterCreated + workoutsCreated;

  // Mark migration complete
  await updateDoc(doc(db, 'users', userId), {
    migrationCompletedAt: serverTimestamp(),
    // Backfill totalWorkouts in legacy stats if it's 0/missing
    ...(workoutsSnap.size > 0 && !userData.stats?.totalWorkouts
      ? { 'stats.totalWorkouts': workoutsSnap.size }
      : {}),
  });

  // Rebuild stats cache from the now-complete events set
  if (totalEventsCreated > 0 || workoutsSnap.size > 0) {
    await recomputeStatsCache(userId);
  }

  console.log(
    `[Migration] ${userId}: migrated ${mealsCreated} meals, ` +
      `${waterCreated} water, ${workoutsCreated} workouts → ${totalEventsCreated} events created`
  );

  return { alreadyMigrated: false, mealsCreated, waterCreated, workoutsCreated, totalEventsCreated };
}

// ---------------------------------------------------------------------------
// Stats rebuild (named export for explicit admin-triggered rebuilds)
// ---------------------------------------------------------------------------

/** Full stats recompute from events — single source of truth reset. */
export async function rebuildStatsCache(userId: string) {
  return recomputeStatsCache(userId);
}

// ---------------------------------------------------------------------------
// Login auto-heal
// ---------------------------------------------------------------------------

/**
 * Called silently on every login. Runs migration if not yet done.
 * Never throws — errors are logged and swallowed so auth flow is unaffected.
 */
export async function checkAndRunMigration(userId: string): Promise<void> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));

    if (userSnap.data()?.migrationCompletedAt) return; // already migrated

    // Check if there's any legacy data worth migrating
    const [mealCheck, waterCheck, workoutCheck] = await Promise.all([
      getDocs(query(collection(db, 'meals'), where('userId', '==', userId), limit(1))),
      getDocs(query(collection(db, 'waterLogs'), where('userId', '==', userId), limit(1))),
      getDocs(query(collection(db, 'workoutLogs'), where('userId', '==', userId), limit(1))),
    ]);

    const hasLegacyData = mealCheck.size > 0 || waterCheck.size > 0 || workoutCheck.size > 0;

    if (hasLegacyData) {
      // Claim the migration before running it. This runs on every login with
      // no lock, so a legacy account opened in two tabs at once ran it twice
      // — both read "no events yet" before either wrote, and every meal and
      // water log was duplicated. A stale claim (crashed mid-run) expires
      // after ten minutes so nobody is locked out of their own history.
      const claimed = await runTransaction(db, async (tx) => {
        const snap = await tx.get(doc(db, 'users', userId));
        const startedAt = (snap.data()?.migrationStartedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
        if (snap.data()?.migrationCompletedAt) return false;
        if (Date.now() - startedAt < 10 * 60_000) return false;
        tx.update(doc(db, 'users', userId), { migrationStartedAt: serverTimestamp() });
        return true;
      });
      if (!claimed) return;
      console.log('[Migration] Legacy data found for', userId, '— running migration');
      await migrateLegacyUserData(userId);
    } else {
      // New user — no legacy data. Just stamp migrationCompletedAt so we don't check again.
      await updateDoc(doc(db, 'users', userId), {
        migrationCompletedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('[Migration] checkAndRunMigration failed for', userId, err);
  }
}

