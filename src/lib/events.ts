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
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { EventType, StatsCache } from '@/types';

export interface EventPayload extends Record<string, unknown> {}

export async function createEvent(data: {
  type: EventType;
  userId: string;
  trainerId: string;
  payload: EventPayload;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'events'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  // Recompute stats cache without blocking the caller
  recomputeStatsCache(data.userId).catch((err) =>
    console.error('[Events] Stats recompute failed:', err)
  );
  return ref.id;
}

/**
 * Derives and caches user stats from the events collection.
 * Called after every event creation and on login.
 */
export async function recomputeStatsCache(userId: string): Promise<StatsCache> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);

  // Total workouts — all time
  const workoutSnap = await getDocs(
    query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('type', '==', 'WORKOUT_COMPLETED')
    )
  );
  const totalWorkouts = workoutSnap.size;

  // Calories logged today
  const mealSnap = await getDocs(
    query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('type', '==', 'MEAL_LOGGED'),
      where('createdAt', '>=', todayTs)
    )
  );
  const caloriesToday = mealSnap.docs.reduce(
    (sum, d) => sum + (((d.data().payload) as Record<string, number>).calories ?? 0),
    0
  );

  // Water logged today (ml)
  const waterSnap = await getDocs(
    query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('type', '==', 'WATER_LOGGED'),
      where('createdAt', '>=', todayTs)
    )
  );
  const waterToday = waterSnap.docs.reduce(
    (sum, d) => sum + (((d.data().payload) as Record<string, number>).amountMl ?? 0),
    0
  );

  // Streak — consecutive workout days ending today or yesterday
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  sixtyDaysAgo.setHours(0, 0, 0, 0);

  const streakSnap = await getDocs(
    query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('type', '==', 'WORKOUT_COMPLETED'),
      where('createdAt', '>=', Timestamp.fromDate(sixtyDaysAgo)),
      orderBy('createdAt', 'desc')
    )
  );

  // Unique workout days (YYYY-M-D key to avoid timezone issues)
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

  await updateDoc(doc(db, 'users', userId), { statsCache });
  return statsCache;
}

function computeStreak(workoutDays: Set<string>): number {
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

  // If no workout today, start checking from yesterday
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
