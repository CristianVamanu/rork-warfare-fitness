/**
 * Event system — single write path for all user activity tracking.
 * All tracking actions must call createEvent(); stats are derived from events.
 */

import {
  addDoc,
  collection,
  doc,
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
      const all = await getDocs(query(collection(db, 'events'), where('userId', '==', userId), orderBy('createdAt', 'desc')));
      return { docs: all.docs.filter((d) => {
        if (d.data().type !== type) return false;
        if (fromTs) {
          const ts = d.data().createdAt as Timestamp | null;
          if (!ts || ts.toMillis() < fromTs.toMillis()) return false;
        }
        return true;
      }) };
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

  const streak = computeStreak(workoutDays);

  const statsCache: StatsCache = {
    totalWorkouts,
    caloriesToday,
    waterToday,
    streak,
    lastUpdated: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', userId), { statsCache }, { merge: true });
  return statsCache;
}

function computeStreak(workoutDays: Set<string>): number {
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

  if (!workoutDays.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (workoutDays.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
