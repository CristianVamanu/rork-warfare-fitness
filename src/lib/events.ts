/**
 * Event system — single write path for all user activity tracking.
 * All tracking actions must call createEvent(); stats are derived from events.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { EventType, StatsCache } from '@/types';

const STREAK_FREEZE_GRANT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface EventPayload extends Record<string, unknown> {}

// ---------------------------------------------------------------------------
// createEvent — with single retry on transient failures (Task 7)
// ---------------------------------------------------------------------------

export async function createEvent(data: {
  type: EventType;
  userId: string;
  trainerId: string;
  payload: EventPayload;
}): Promise<string> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const ref = await addDoc(collection(db, 'events'), {
        ...data,
        createdAt: serverTimestamp(),
      });
      // Non-blocking stats recompute
      recomputeStatsCache(data.userId).catch((err) =>
        console.error('[Events] Stats recompute failed:', err)
      );
      return ref.id;
    } catch (err) {
      lastErr = err;
      const e = err as Error & { code?: string };
      // permission-denied will never succeed on retry — fail fast with a clear message
      if (e?.code === 'permission-denied') {
        console.error(
          '[Events] createEvent: permission-denied. ' +
          'Firestore rules may not be deployed. Run: firebase deploy --only firestore:rules'
        );
        throw err;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        console.warn('[Events] createEvent attempt 1 failed — retrying:', e?.message);
      }
    }
  }

  console.error('[Events] createEvent failed after retry:', lastErr);
  throw lastErr;
}

// ---------------------------------------------------------------------------
// recomputeStatsCache — derives and caches stats from events (single source of truth)
// ---------------------------------------------------------------------------

export async function recomputeStatsCache(userId: string): Promise<StatsCache> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);

  // Helper: query events with client-side fallback when composite index is missing
  async function queryEvents(type: string, fromTs?: Timestamp) {
    const constraints = [
      where('userId', '==', userId),
      where('type', '==', type),
      ...(fromTs ? [where('createdAt', '>=', fromTs), orderBy('createdAt', 'desc')] : []),
    ];
    try {
      return await getDocs(query(collection(db, 'events'), ...constraints));
    } catch {
      // Fallback: only userId filter (auto-indexed) + client-side filter/sort
      const all = await getDocs(query(collection(db, 'events'), where('userId', '==', userId)));
      const filtered = all.docs.filter((d) => {
        if (d.data().type !== type) return false;
        if (fromTs) {
          const ts = d.data().createdAt as Timestamp | null;
          if (!ts || ts.toMillis() < fromTs.toMillis()) return false;
        }
        return true;
      });
      filtered.sort((a, b) => {
        const ta = (a.data().createdAt as Timestamp)?.toMillis() ?? 0;
        const tb = (b.data().createdAt as Timestamp)?.toMillis() ?? 0;
        return tb - ta;
      });
      return { docs: filtered };
    }
  }

  // Total workouts — all time
  const workoutSnap = await queryEvents('WORKOUT_COMPLETED');
  const totalWorkouts = workoutSnap.docs.length;

  // Calories logged today
  const mealSnap = await queryEvents('MEAL_LOGGED', todayTs);
  const caloriesToday = mealSnap.docs.reduce(
    (sum, d) => sum + (((d.data().payload) as Record<string, number>).calories ?? 0),
    0
  );

  // Water logged today (ml)
  const waterSnap = await queryEvents('WATER_LOGGED', todayTs);
  const waterToday = waterSnap.docs.reduce(
    (sum, d) => sum + (((d.data().payload) as Record<string, number>).amountMl ?? 0),
    0
  );

  // Streak — consecutive workout days ending today or yesterday
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  sixtyDaysAgo.setHours(0, 0, 0, 0);

  const streakSnap = await queryEvents('WORKOUT_COMPLETED', Timestamp.fromDate(sixtyDaysAgo));

  const workoutDays = new Set<string>();
  streakSnap.docs.forEach((d) => {
    const ts = d.data().createdAt as Timestamp | undefined;
    if (ts?.toDate) {
      const dt = ts.toDate();
      workoutDays.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`);
    }
  });

  // Streak freeze — one grace day every 7 days that absorbs a single missed
  // day without breaking the streak. Re-grant is computed here (not on a
  // cron) so it self-heals on the next event regardless of when the user
  // comes back.
  const userSnap = await getDoc(doc(db, 'users', userId));
  const existingFreeze = userSnap.data()?.streakFreeze as
    | { available: boolean; lastGrantedAt: Timestamp | null; lastUsedAt?: Timestamp }
    | undefined;
  const now = Date.now();
  const lastGrantedMs = existingFreeze?.lastGrantedAt?.toMillis?.() ?? 0;
  const dueForRegrant = now - lastGrantedMs >= STREAK_FREEZE_GRANT_INTERVAL_MS;
  const freezeAvailable = !existingFreeze || existingFreeze.available || dueForRegrant;

  const { streak, freezeConsumed } = computeStreak(workoutDays, freezeAvailable);

  const statsCache: StatsCache = {
    totalWorkouts,
    caloriesToday,
    waterToday,
    streak,
    lastUpdated: serverTimestamp(),
    cacheDate: new Date().toLocaleDateString('sv-SE'),
  };

  await setDoc(doc(db, 'users', userId), {
    statsCache,
    streakFreeze: {
      available: freezeConsumed ? false : freezeAvailable,
      lastGrantedAt: dueForRegrant ? serverTimestamp() : (existingFreeze?.lastGrantedAt ?? serverTimestamp()),
      ...(freezeConsumed ? { lastUsedAt: serverTimestamp() } : {}),
    },
  }, { merge: true });

  // Mirror to the public leaderboard doc — see firestore.ts syncLeaderboardPublic.
  // This is the sole writer of `streak` there, matching statsCache above.
  await setDoc(doc(db, 'leaderboardPublic', userId), { streak, totalWorkouts }, { merge: true }).catch((err) =>
    console.error('[Events] leaderboardPublic sync failed:', err)
  );

  return statsCache;
}

function computeStreak(
  workoutDays: Set<string>,
  freezeAvailable: boolean
): { streak: number; freezeConsumed: boolean } {
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

  if (!workoutDays.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  let streak = 0;
  let freezeConsumed = false;
  for (let i = 0; i < 60; i++) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (workoutDays.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (freezeAvailable && !freezeConsumed && streak > 0) {
      // Only spends the freeze mid-streak (streak > 0) — an unused freeze
      // shouldn't fabricate a streak out of zero consecutive days.
      freezeConsumed = true;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return { streak, freezeConsumed };
}
