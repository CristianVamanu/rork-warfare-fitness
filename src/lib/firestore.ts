import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserGoals } from '@/types';

// System config
export async function getSystemConfig() {
  const snap = await getDoc(doc(db, 'system', 'config'));
  return snap.exists() ? snap.data() : null;
}

export async function getInstallerStatus() {
  try {
    const snap = await getDoc(doc(db, 'system', 'installer'));
    return snap.exists() ? (snap.data() as { installed: boolean; installedAt?: Timestamp }) : null;
  } catch {
    return null;
  }
}

export async function setSystemConfig(config: Record<string, unknown>) {
  await setDoc(doc(db, 'system', 'config'), config, { merge: true });
}

export async function markInstalled() {
  await setDoc(doc(db, 'system', 'installer'), {
    installed: true,
    installedAt: serverTimestamp(),
  });
}

// Users
export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserDoc(uid: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, 'users', uid), { ...data, lastActive: serverTimestamp() });
}

export async function getUserGoals(uid: string): Promise<UserGoals> {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data();
  return (data?.goals as UserGoals) ?? { calories: 2200, protein: 160, carbs: 250, fat: 70, water: 3000 };
}

export async function updateUserGoals(uid: string, goals: UserGoals) {
  await updateDoc(doc(db, 'users', uid), { goals, lastActive: serverTimestamp() });
}

// Workout logs
export async function logWorkout(data: {
  userId: string;
  programId?: string;
  exercises: Array<{ name: string; sets: Array<{ weight: number; reps: number }> }>;
  duration: number;
  calories: number;
}) {
  return await addDoc(collection(db, 'workoutLogs'), {
    ...data,
    completedAt: serverTimestamp(),
  });
}

export async function getUserWorkouts(userId: string, limitCount = 10) {
  const q = query(
    collection(db, 'workoutLogs'),
    where('userId', '==', userId),
    orderBy('completedAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Meals
export async function logMeal(data: {
  userId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}) {
  return await addDoc(collection(db, 'meals'), {
    ...data,
    loggedAt: serverTimestamp(),
  });
}

export async function getTodayMeals(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, 'meals'),
    where('userId', '==', userId),
    where('loggedAt', '>=', Timestamp.fromDate(start)),
    orderBy('loggedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Water logs
export async function logWater(userId: string, amountMl: number) {
  return await addDoc(collection(db, 'waterLogs'), {
    userId,
    amountMl,
    loggedAt: serverTimestamp(),
  });
}

export async function deleteWaterLog(id: string) {
  await deleteDoc(doc(db, 'waterLogs', id));
}

export async function getTodayWater(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, 'waterLogs'),
    where('userId', '==', userId),
    where('loggedAt', '>=', Timestamp.fromDate(start))
  );
  const snap = await getDocs(q);
  return snap.docs.reduce((sum, d) => sum + (d.data().amountMl as number), 0);
}

export async function getTodayWaterLogs(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, 'waterLogs'),
    where('userId', '==', userId),
    where('loggedAt', '>=', Timestamp.fromDate(start)),
    orderBy('loggedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, amountMl: d.data().amountMl as number, loggedAt: d.data().loggedAt }));
}

export async function deleteMeal(id: string) {
  await deleteDoc(doc(db, 'meals', id));
}

// Programs
export async function getPrograms(isPublic = true) {
  const q = query(
    collection(db, 'programs'),
    where('isPublic', '==', isPublic),
    orderBy('name')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getProgram(id: string) {
  const snap = await getDoc(doc(db, 'programs', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Community posts
export async function createPost(data: {
  userId: string;
  userDisplayName: string;
  userPhotoURL?: string;
  content: string;
  imageURL?: string;
}) {
  return await addDoc(collection(db, 'posts'), {
    ...data,
    likes: [],
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function getPosts(limitCount = 20) {
  const q = query(
    collection(db, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
