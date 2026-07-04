/**
 * Firestore data access layer.
 *
 * Read strategy (dual system compatibility):
 *   1. Events collection (primary — new architecture)
 *   2. Legacy collections: meals / waterLogs / workoutLogs (fallback — pre-migration data)
 *
 * Write policy:
 *   - Legacy collections are READ-ONLY here (for migration/fallback only).
 *   - All new writes go through actions.ts → createEvent().
 */

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
  increment,
  onSnapshot,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserGoals, CoachingPlan, ExerciseVideo, NutritionPlan } from '@/types';

// ---------------------------------------------------------------------------
// Query safety wrapper — surfaces missing-index errors instead of silent []
// ---------------------------------------------------------------------------
async function runQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    const msg = e?.message ?? '';
    const isIndexError =
      e?.code === 'failed-precondition' ||
      msg.includes('requires an index') ||
      msg.includes('The query requires an index');
    if (isIndexError) {
      const urlMatch = msg.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
      const createUrl = urlMatch?.[0] ?? '';
      console.error(
        `[Firestore] Missing composite index for "${label}".`,
        createUrl ? `Create it at: ${createUrl}` : 'Check Firebase Console → Firestore → Indexes.'
      );
      throw Object.assign(
        new Error(
          `Missing database index for "${label}". ` +
            (createUrl ? `Create it at: ${createUrl}` : 'Check server logs.')
        ),
        { code: 'index-missing', createUrl }
      );
    }
    console.error(`[Firestore] Query "${label}" failed:`, e?.code, msg);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Safe event query — falls back to userId-only when composite index is missing
// ---------------------------------------------------------------------------
async function safeGetEvents(
  userId: string,
  type: string,
  fromTs?: Timestamp,
  toTs?: Timestamp,
  limitN?: number
) {
  // Compound query — requires deployed composite index
  const compoundConstraints = [
    where('userId', '==', userId),
    where('type', '==', type),
    ...(fromTs ? [where('createdAt', '>=', fromTs), orderBy('createdAt', 'desc')] : []),
    ...(toTs ? [where('createdAt', '<=', toTs)] : []),
    ...(limitN ? [limit(limitN)] : []),
  ];

  try {
    return await getDocs(query(collection(db, 'events'), ...compoundConstraints));
  } catch (err) {
    const e = err as Error & { code?: string };
    const isIndex = e?.code === 'failed-precondition' || (e?.message ?? '').includes('index');
    if (!isIndex) throw err;

    // Fallback: userId-only (auto-indexed by Firestore, no manual index needed)
    // Filter and sort entirely on the client.
    console.warn('[Firestore] Missing index for events type=' + type + ' — using client-side filter fallback.');
    const allSnap = await getDocs(query(collection(db, 'events'), where('userId', '==', userId)));
    const filtered = allSnap.docs.filter((d) => {
      const data = d.data();
      if (data.type !== type) return false;
      const ts = data.createdAt as Timestamp | null;
      if (fromTs && ts && ts.toMillis() < fromTs.toMillis()) return false;
      if (toTs && ts && ts.toMillis() > toTs.toMillis()) return false;
      return true;
    });
    // Sort descending by createdAt client-side
    filtered.sort((a, b) => {
      const ta = (a.data().createdAt as Timestamp)?.toMillis() ?? 0;
      const tb = (b.data().createdAt as Timestamp)?.toMillis() ?? 0;
      return tb - ta;
    });
    if (limitN) filtered.splice(limitN);
    return { docs: filtered };
  }
}

// ---------------------------------------------------------------------------
// System config
// ---------------------------------------------------------------------------
export async function getSystemConfig() {
  const snap = await getDoc(doc(db, 'system', 'config'));
  return snap.exists() ? snap.data() : null;
}

export async function getInstallerStatus() {
  try {
    const snap = await getDoc(doc(db, 'system', 'installer'));
    return snap.exists()
      ? (snap.data() as { installed: boolean; installedAt?: Timestamp })
      : null;
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

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserDoc(uid: string, data: Record<string, unknown>) {
  await setDoc(doc(db, 'users', uid), { ...data, lastActive: serverTimestamp() }, { merge: true });
}

export async function getUserGoals(uid: string): Promise<UserGoals> {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data();
  return (
    (data?.goals as UserGoals) ?? {
      calories: 2200,
      protein: 160,
      carbs: 250,
      fat: 70,
      water: 3000,
    }
  );
}

export async function updateUserGoals(uid: string, goals: UserGoals) {
  await setDoc(doc(db, 'users', uid), { goals, lastActive: serverTimestamp() }, { merge: true });
}

// ---------------------------------------------------------------------------
// Meals — event-primary reads with legacy fallback
// ---------------------------------------------------------------------------

interface NormalizedMeal {
  id: string;
  userId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: string;
  loggedAt: unknown;
}

export async function getTodayMeals(userId: string, localDateStr?: string): Promise<NormalizedMeal[]> {
  const start = localDateStr ? new Date(localDateStr + 'T00:00:00') : new Date();
  if (!localDateStr) start.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(start);

  // 1. Try events (primary) — always return this result, even if empty
  try {
    const snap = await safeGetEvents(userId, 'MEAL_LOGGED', todayTs);
    return snap.docs.map((d) => {
      const payload = d.data().payload as Record<string, unknown>;
      return {
        id: d.id,
        userId,
        name: String(payload.name ?? ''),
        calories: Number(payload.calories ?? 0),
        protein: Number(payload.protein ?? 0),
        carbs: Number(payload.carbs ?? 0),
        fat: Number(payload.fat ?? 0),
        mealType: String(payload.mealType ?? 'snack'),
        loggedAt: d.data().createdAt,
      };
    });
  } catch (err) {
    console.warn('[Firestore] getTodayMeals: events query failed, trying legacy fallback', err);
  }

  // 2. Legacy fallback (meals collection)
  return runQuery('meals:today:legacy', async () => {
    const q = query(
      collection(db, 'meals'),
      where('userId', '==', userId),
      where('loggedAt', '>=', todayTs),
      orderBy('loggedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NormalizedMeal));
  });
}

/**
 * Deletes a meal. Tries events collection first (post-migration id), then
 * falls back to legacy meals collection (pre-migration id).
 */
export async function deleteMeal(id: string) {
  try {
    await deleteDoc(doc(db, 'events', id));
    return;
  } catch {
    // Event doc not found — fall through to legacy collection
  }
  try {
    await deleteDoc(doc(db, 'meals', id));
  } catch (err) {
    console.error('[Firestore] deleteMeal failed for id', id, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Water logs — event-primary reads with legacy fallback
// ---------------------------------------------------------------------------

interface NormalizedWaterLog {
  id: string;
  amountMl: number;
  loggedAt: unknown;
}

export async function getTodayWater(userId: string, localDateStr?: string): Promise<number> {
  const start = localDateStr ? new Date(localDateStr + 'T00:00:00') : new Date();
  if (!localDateStr) start.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(start);

  // 1. Try events (primary) — always return this result, even if empty
  try {
    const snap = await safeGetEvents(userId, 'WATER_LOGGED', todayTs);
    return snap.docs.reduce(
      (sum, d) => sum + Number((d.data().payload as Record<string, unknown>).amountMl ?? 0),
      0
    );
  } catch (err) {
    console.warn('[Firestore] getTodayWater: events query failed, trying legacy fallback', err);
  }

  // 2. Legacy fallback
  return runQuery('waterLogs:today:total:legacy', async () => {
    const q = query(
      collection(db, 'waterLogs'),
      where('userId', '==', userId),
      where('loggedAt', '>=', todayTs)
    );
    const snap = await getDocs(q);
    return snap.docs.reduce((sum, d) => sum + (d.data().amountMl as number), 0);
  });
}

export async function getTodayWaterLogs(userId: string, localDateStr?: string): Promise<NormalizedWaterLog[]> {
  const start = localDateStr ? new Date(localDateStr + 'T00:00:00') : new Date();
  if (!localDateStr) start.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(start);

  // 1. Try events (primary) — always return this result, even if empty
  try {
    const snap = await safeGetEvents(userId, 'WATER_LOGGED', todayTs);
    return snap.docs.map((d) => ({
      id: d.id,
      amountMl: Number((d.data().payload as Record<string, unknown>).amountMl ?? 0),
      loggedAt: d.data().createdAt,
    }));
  } catch (err) {
    console.warn('[Firestore] getTodayWaterLogs: events query failed, trying legacy fallback', err);
  }

  // 2. Legacy fallback
  return runQuery('waterLogs:today:list:legacy', async () => {
    const q = query(
      collection(db, 'waterLogs'),
      where('userId', '==', userId),
      where('loggedAt', '>=', todayTs),
      orderBy('loggedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      amountMl: d.data().amountMl as number,
      loggedAt: d.data().loggedAt,
    }));
  });
}

export async function deleteWaterLog(id: string) {
  try {
    await deleteDoc(doc(db, 'events', id));
    return;
  } catch {
    // Not in events — try legacy
  }
  try {
    await deleteDoc(doc(db, 'waterLogs', id));
  } catch (err) {
    console.error('[Firestore] deleteWaterLog failed for id', id, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Workout history — event-primary reads with legacy fallback
// ---------------------------------------------------------------------------

export async function getUserWorkouts(userId: string, limitCount = 10) {
  // 1. Try events (primary)
  try {
    const snap = await safeGetEvents(userId, 'WORKOUT_COMPLETED', undefined, undefined, limitCount);
    if (snap.docs.length > 0) {
      return snap.docs.map((d) => {
        const payload = d.data().payload as Record<string, unknown>;
        return {
          id: d.id,
          userId,
          programId: payload.programId ?? null,
          duration: Number(payload.duration ?? 0),
          calories: Number(payload.calories ?? 0),
          exercises: payload.exercises ?? [],
          totalWeightLifted: Number(payload.totalWeightLifted ?? 0),
          completedAt: d.data().createdAt,
        };
      });
    }
  } catch (err) {
    console.warn('[Firestore] getUserWorkouts: events query failed, trying legacy fallback', err);
  }

  // 2. Legacy fallback
  return runQuery('workoutLogs:byUser:legacy', async () => {
    const q = query(
      collection(db, 'workoutLogs'),
      where('userId', '==', userId),
      orderBy('completedAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

interface WorkoutSetLog {
  weight: number;
  reps: number;
  completed: boolean;
}
interface WorkoutExerciseLog {
  name: string;
  sets: WorkoutSetLog[];
}
interface UserWorkoutRecord {
  exercises: WorkoutExerciseLog[];
  totalWeightLifted: number;
  completedAt: { toDate?: () => Date } | null;
}

export interface WeeklySummary {
  volumeKg: number;
  workoutsCompleted: number;
}

/** Real, computed-from-history weekly totals — no estimation. */
export async function getWeeklySummary(userId: string): Promise<WeeklySummary> {
  const workouts = await getUserWorkouts(userId, 20) as unknown as UserWorkoutRecord[];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let volumeKg = 0;
  let workoutsCompleted = 0;
  for (const w of workouts) {
    const completedDate = w.completedAt?.toDate?.() ?? null;
    if (!completedDate || completedDate.getTime() < weekAgo) continue;
    workoutsCompleted++;
    volumeKg += w.totalWeightLifted ?? 0;
  }
  return { volumeKg: Math.round(volumeKg), workoutsCompleted };
}

export interface PersonalBest {
  weight: number;
  reps: number;
}

/** Scans logged set history for the heaviest completed set of a given exercise. */
export async function getPersonalBest(userId: string, exerciseName: string): Promise<PersonalBest | null> {
  const target = exerciseName.trim().toLowerCase();
  if (!target) return null;
  const workouts = await getUserWorkouts(userId, 30) as unknown as UserWorkoutRecord[];
  let best: PersonalBest | null = null;
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (String(ex.name ?? '').trim().toLowerCase() !== target) continue;
      for (const s of ex.sets ?? []) {
        if (!s.completed || !s.weight) continue;
        if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
          best = { weight: s.weight, reps: s.reps };
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Programs — scoped by trainerId when provided
// ---------------------------------------------------------------------------
export async function getPrograms(trainerId?: string) {
  // Full collection scan + client-side filter avoids composite index requirement
  const snap = await getDocs(collection(db, 'programs'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (trainerId) {
    return all.filter((p) => p.trainerId === trainerId).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  return all
    .filter((p) => p.isPublic === true || p.visibility === 'public')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function getProgram(id: string) {
  const snap = await getDoc(doc(db, 'programs', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createProgram(data: Record<string, unknown>) {
  return addDoc(collection(db, 'programs'), { ...data, createdAt: serverTimestamp() });
}

export async function updateProgram(id: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, 'programs', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProgram(id: string) {
  await deleteDoc(doc(db, 'programs', id));
}

// ---------------------------------------------------------------------------
// Community posts — scoped by trainerId when provided
// ---------------------------------------------------------------------------
export async function createPost(data: {
  userId: string;
  trainerId?: string;
  userDisplayName: string;
  userPhotoURL?: string;
  content: string;
  imageURL?: string;
}) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return addDoc(collection(db, 'posts'), {
    ...clean,
    likes: [],
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function getPosts(limitCount = 20, trainerId?: string) {
  if (trainerId) {
    return runQuery('posts:byTrainer', async () => {
      const q = query(
        collection(db, 'posts'),
        where('trainerId', '==', trainerId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
  }
  return runQuery('posts:recent', async () => {
    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

// ---------------------------------------------------------------------------
// Program enrollment
// ---------------------------------------------------------------------------

export async function enrollInProgram(
  userId: string,
  program: { id: string; name: string; weeks: number; daysPerWeek: number }
) {
  const totalWorkouts = program.weeks * program.daysPerWeek;
  await setDoc(
    doc(db, 'users', userId),
    {
      activeProgram: {
        programId: program.id,
        programName: program.name,
        enrolledAt: serverTimestamp(),
        programStartDate: new Date().toISOString(),
        completedWorkouts: 0,
        totalWorkouts,
      },
      lastActive: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function unenrollProgram(userId: string) {
  await setDoc(
    doc(db, 'users', userId),
    { activeProgram: deleteField(), lastActive: serverTimestamp() },
    { merge: true }
  );
}

export async function incrementProgramWorkouts(userId: string, dayIndex?: number) {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists() || !snap.data()?.activeProgram) return;
  const lastCompleted: number = snap.data()?.activeProgram?.lastCompletedDayIndex ?? -1;
  // Only advance the counter when doing a genuinely new (later) day, not a repeat
  const isNewDay = dayIndex === undefined || dayIndex > lastCompleted;
  await updateDoc(doc(db, 'users', userId), {
    ...(isNewDay ? { 'activeProgram.completedWorkouts': increment(1) } : {}),
    ...(dayIndex !== undefined && isNewDay ? { 'activeProgram.lastCompletedDayIndex': dayIndex } : {}),
    lastActive: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Meal history — by date
// ---------------------------------------------------------------------------

export async function getMealsForDate(userId: string, date: Date): Promise<NormalizedMeal[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  try {
    const snap = await safeGetEvents(userId, 'MEAL_LOGGED', startTs, endTs);
    return snap.docs.map((d) => {
      const payload = d.data().payload as Record<string, unknown>;
      return {
        id: d.id,
        userId,
        name: String(payload.name ?? ''),
        calories: Number(payload.calories ?? 0),
        protein: Number(payload.protein ?? 0),
        carbs: Number(payload.carbs ?? 0),
        fat: Number(payload.fat ?? 0),
        mealType: String(payload.mealType ?? 'snack'),
        loggedAt: d.data().createdAt,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Real-time listeners for today's nutrition (used by dashboard widget)
// ---------------------------------------------------------------------------

export function subscribeTodayCalories(
  userId: string,
  localDateStr: string,
  onUpdate: (calories: number) => void,
): () => void {
  const todayTs = Timestamp.fromDate(new Date(localDateStr));
  const q = query(
    collection(db, 'events'),
    where('userId', '==', userId),
    where('type', '==', 'MEAL_LOGGED'),
    where('createdAt', '>=', todayTs),
  );
  return onSnapshot(q, (snap) => {
    const total = snap.docs.reduce(
      (sum, d) => sum + (((d.data().payload) as Record<string, number>)?.calories ?? 0),
      0,
    );
    onUpdate(total);
  });
}

export function subscribeTodayWater(
  userId: string,
  localDateStr: string,
  onUpdate: (ml: number) => void,
): () => void {
  const todayTs = Timestamp.fromDate(new Date(localDateStr));
  const q = query(
    collection(db, 'events'),
    where('userId', '==', userId),
    where('type', '==', 'WATER_LOGGED'),
    where('createdAt', '>=', todayTs),
  );
  return onSnapshot(q, (snap) => {
    const total = snap.docs.reduce(
      (sum, d) => sum + (((d.data().payload) as Record<string, number>)?.amountMl ?? 0),
      0,
    );
    onUpdate(total);
  });
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

import type { OnboardingData, Program } from '@/types';

export async function saveOnboardingData(
  uid: string,
  data: OnboardingData & { onboardingComplete: boolean }
) {
  await setDoc(doc(db, 'users', uid), { ...data, lastActive: serverTimestamp() }, { merge: true });
}

export async function createAIProgram(program: Omit<Program, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'programs'), {
    ...program,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ---------------------------------------------------------------------------
// Admin — user management
// ---------------------------------------------------------------------------

export async function banUser(userId: string) {
  await updateDoc(doc(db, 'users', userId), { banned: true });
}

export async function unbanUser(userId: string) {
  await updateDoc(doc(db, 'users', userId), { banned: false });
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllPrograms() {
  const snap = await getDocs(collection(db, 'programs'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Hidden mock programs — stored at config/hiddenMocks { ids: string[] }
// ---------------------------------------------------------------------------
export async function getHiddenMockIds(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'config', 'hiddenMocks'));
  return snap.exists() ? ((snap.data().ids as string[]) ?? []) : [];
}

export async function hideMockProgram(id: string) {
  const snap = await getDoc(doc(db, 'config', 'hiddenMocks'));
  const ids: string[] = snap.exists() ? (snap.data().ids ?? []) : [];
  if (!ids.includes(id)) {
    await setDoc(doc(db, 'config', 'hiddenMocks'), { ids: [...ids, id] }, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Membership configuration — stored at config/membership
// ---------------------------------------------------------------------------
import type { MembershipConfig } from '@/types';

export async function getMembershipConfig(): Promise<MembershipConfig | null> {
  const snap = await getDoc(doc(db, 'config', 'membership'));
  if (!snap.exists()) return null;
  return snap.data() as MembershipConfig;
}

export async function saveMembershipConfig(data: Partial<MembershipConfig>) {
  await setDoc(doc(db, 'config', 'membership'), data, { merge: true });
}

export async function setUserMembership(userId: string, status: 'active' | 'none') {
  await updateDoc(doc(db, 'users', userId), {
    'membership.status': status,
    'membership.grantedAt': serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Conversations — admin-initiated DMs
// ---------------------------------------------------------------------------

import type { Conversation, Message } from '@/types';

export async function getOrCreateConversation(
  adminId: string,
  userId: string,
  userDisplayName: string,
  userEmail: string
): Promise<string> {
  const q = query(
    collection(db, 'conversations'),
    where('adminId', '==', adminId),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;

  const ref = await addDoc(collection(db, 'conversations'), {
    adminId,
    userId,
    userDisplayName,
    userEmail,
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    unreadByUser: false,
    unreadByAdmin: false,
  });
  return ref.id;
}

export async function getAdminConversations(adminId: string): Promise<Conversation[]> {
  const q = query(collection(db, 'conversations'), where('adminId', '==', adminId));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
  docs.sort((a, b) => {
    const ta = (a.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    const tb = (b.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return docs;
}

export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const q = query(collection(db, 'conversations'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
  docs.sort((a, b) => {
    const ta = (a.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    const tb = (b.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return docs;
}

export async function getMessages(convId: string): Promise<Message[]> {
  try {
    const q = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
  } catch {
    const snap = await getDocs(collection(db, 'conversations', convId, 'messages'));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
    docs.sort((a, b) => {
      const ta = (a.createdAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      return ta - tb;
    });
    return docs;
  }
}

export async function sendMessage(
  convId: string,
  senderId: string,
  senderName: string,
  content: string,
  isFromAdmin: boolean
) {
  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    senderId,
    senderName,
    content,
    isFromAdmin,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: content,
    lastMessageAt: serverTimestamp(),
    ...(isFromAdmin ? { unreadByUser: true } : { unreadByAdmin: true }),
  });
}

export async function deleteConversation(convId: string) {
  // Delete all messages in the subcollection first
  const msgs = await getDocs(collection(db, 'conversations', convId, 'messages'));
  await Promise.all(msgs.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'conversations', convId));
}

export async function markConversationRead(convId: string, isAdmin: boolean) {
  await updateDoc(doc(db, 'conversations', convId), {
    ...(isAdmin ? { unreadByAdmin: false } : { unreadByUser: false }),
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
import type { AppNotification, NotificationConfig } from '@/types';

export async function sendNotification(data: {
  userId: string;
  trainerId?: string;
  title: string;
  body: string;
  type: AppNotification['type'];
  actionLabel?: string;
  actionUrl?: string;
}) {
  await addDoc(collection(db, 'notifications'), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function sendNotificationToAll(userIds: string[], data: {
  trainerId?: string;
  title: string;
  body: string;
  type: AppNotification['type'];
}) {
  await Promise.all(userIds.map((uid) => sendNotification({ ...data, userId: uid })));
}

// NOTE: sorted client-side rather than via Firestore orderBy() to avoid
// requiring a composite (userId + createdAt) index — this collection is
// small per-user, so an in-memory sort is cheap and needs zero Firebase
// console setup.
export async function getUserNotifications(userId: string): Promise<AppNotification[]> {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId), limit(200))
  );
  const notifs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
  return notifs
    .sort((a, b) => ((b.createdAt as Timestamp)?.toMillis() ?? 0) - ((a.createdAt as Timestamp)?.toMillis() ?? 0))
    .slice(0, 50);
}

export async function markNotificationRead(notifId: string) {
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}

export async function markAllNotificationsRead(userId: string) {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false))
  );
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false))
  );
  return snap.size;
}

export async function getNotificationConfig(): Promise<NotificationConfig | null> {
  const snap = await getDoc(doc(db, 'config', 'notifications'));
  return snap.exists() ? (snap.data() as NotificationConfig) : null;
}

export async function saveNotificationConfig(data: Partial<NotificationConfig>) {
  await setDoc(doc(db, 'config', 'notifications'), data, { merge: true });
}

// ---------------------------------------------------------------------------
// Community channels
// ---------------------------------------------------------------------------
import type { Channel, ChannelPost } from '@/types';

export async function getChannels(trainerId?: string): Promise<Channel[]> {
  const snap = await getDocs(collection(db, 'channels'));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Channel);
  return all
    .filter((c) => !trainerId || c.trainerId === trainerId || !c.trainerId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function createChannel(data: Omit<Channel, 'id' | 'postCount' | 'createdAt'>) {
  const clean = Object.fromEntries(Object.entries({ ...data, postCount: 0, createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined));
  return addDoc(collection(db, 'channels'), clean);
}

export async function updateChannel(id: string, data: Partial<Channel>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clean: Record<string, any> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await updateDoc(doc(db, 'channels', id), clean);
}

export async function deleteUserAccount(userId: string) {
  await deleteDoc(doc(db, 'users', userId));
}

export async function deleteChannel(id: string) {
  await deleteDoc(doc(db, 'channels', id));
}

export async function getChannelPosts(channelId: string): Promise<ChannelPost[]> {
  const snap = await getDocs(
    query(collection(db, 'channels', channelId, 'posts'), orderBy('createdAt', 'asc'), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, channelId, ...d.data() }) as ChannelPost);
}

export async function createChannelPost(channelId: string, data: {
  userId: string; userDisplayName: string; userPhotoURL?: string;
  content: string; imageURL?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'channels', channelId, 'posts'), {
    ...data,
    channelId,
    likes: [],
    replyCount: 0,
    replyTo: null,
    createdAt: serverTimestamp(),
  });
  // bump post count on channel
  await updateDoc(doc(db, 'channels', channelId), { postCount: increment(1) });
  // track last post time for slow mode
  await setDoc(doc(db, 'channels', channelId, 'members', data.userId), { lastPostAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function likeChannelPost(channelId: string, postId: string, userId: string, liked: boolean) {
  const ref = doc(db, 'channels', channelId, 'posts', postId);
  if (liked) {
    await updateDoc(ref, { likes: [...(await getDoc(ref)).data()?.likes ?? [], userId] });
  } else {
    const snap = await getDoc(ref);
    const likes: string[] = (snap.data()?.likes ?? []).filter((id: string) => id !== userId);
    await updateDoc(ref, { likes });
  }
}

export async function getPostReplies(channelId: string, postId: string): Promise<ChannelPost[]> {
  const snap = await getDocs(
    query(collection(db, 'channels', channelId, 'posts', postId, 'replies'), orderBy('createdAt', 'asc'))
  );
  return snap.docs.map((d) => ({ id: d.id, channelId, replyTo: postId, ...d.data() }) as ChannelPost);
}

export async function createReply(channelId: string, postId: string, data: {
  userId: string; userDisplayName: string; userPhotoURL?: string; content: string;
}) {
  await addDoc(collection(db, 'channels', channelId, 'posts', postId, 'replies'), {
    ...data, channelId, likes: [], replyCount: 0, replyTo: postId, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { replyCount: increment(1) });
}

export async function deleteChannelPost(channelId: string, postId: string) {
  await deleteDoc(doc(db, 'channels', channelId, 'posts', postId));
  await updateDoc(doc(db, 'channels', channelId), { postCount: increment(-1) }).catch(() => {});
}

export async function pinChannelPost(channelId: string, postId: string) {
  await updateDoc(doc(db, 'channels', channelId), { pinnedPostId: postId });
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { pinned: true });
}

export async function unpinChannelPost(channelId: string, postId: string) {
  await updateDoc(doc(db, 'channels', channelId), { pinnedPostId: deleteField() });
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { pinned: false });
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  xp: number;
  powerLevel: number;
  streak: number;
  totalWorkouts: number;
}

function mapToLeaderboardEntry(id: string, data: Record<string, unknown>): LeaderboardEntry {
  return {
    id,
    displayName: (data.displayName as string) || 'Athlete',
    xp: (data.xp as number) ?? 0,
    powerLevel: (data.powerLevel as number) ?? 0,
    streak: (data.statsCache as Record<string, number> | undefined)?.streak ?? (data.stats as Record<string, number> | undefined)?.streak ?? 0,
    totalWorkouts: (data.statsCache as Record<string, number> | undefined)?.totalWorkouts ?? (data.stats as Record<string, number> | undefined)?.totalWorkouts ?? 0,
  };
}

// NOTE: This app is currently single-tenant (one trainer per install), so the
// leaderboard intentionally shows every user rather than filtering by
// trainerId — that filter was fragile (any mismatch between a user's stored
// trainerId and the live admin uid made them silently invisible) and adds no
// value with only one trainer. Revisit if true multi-tenant coaching ships.
export async function getLeaderboard(limitCount = 10): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(query(collection(db, 'users'), limit(200)));
  const entries = snap.docs.map((d) => mapToLeaderboardEntry(d.id, d.data())).filter((e) => e.totalWorkouts > 0);
  return entries.sort((a, b) => b.xp - a.xp).slice(0, limitCount);
}

export function subscribeLeaderboard(
  onUpdate: (entries: LeaderboardEntry[]) => void,
  limitCount = 10,
): () => void {
  const q = query(collection(db, 'users'), limit(200));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => mapToLeaderboardEntry(d.id, d.data())).filter((e) => e.totalWorkouts > 0);
    onUpdate(entries.sort((a, b) => b.xp - a.xp).slice(0, limitCount));
  }, (err) => console.error('[Firestore] subscribeLeaderboard error:', err));
}

// ---------------------------------------------------------------------------
// Coaching Plans
// ---------------------------------------------------------------------------

export async function getCoachingPlans(): Promise<CoachingPlan[]> {
  const snap = await getDoc(doc(db, 'config', 'coachingPlans'));
  return (snap.data()?.plans as CoachingPlan[]) ?? [];
}

export async function saveCoachingPlans(plans: CoachingPlan[]): Promise<void> {
  await setDoc(doc(db, 'config', 'coachingPlans'), { plans });
}

export async function assignCoachingPlan(userId: string, planId: string, planName: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    'membership.status': 'active',
    'membership.planId': planId,
    'membership.planName': planName,
    'membership.grantedBy': 'admin',
  });
}

export async function assignNutritionPlan(
  userId: string,
  plan: Omit<NutritionPlan, 'assignedAt'>
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    assignedNutritionPlan: { ...plan, assignedAt: serverTimestamp() },
  });
}

export async function revokeCoachingPlan(userId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    'membership.planId': deleteField(),
    'membership.planName': deleteField(),
  });
}

// ---------------------------------------------------------------------------
// Coaching Applications (intake form → admin review → pay/reject)
// ---------------------------------------------------------------------------
import type { CoachingApplication } from '@/types';

export async function submitCoachingApplication(data: {
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  currentWeight: string;
  goals: string;
  experience: string;
  injuries: string;
  availability: string;
}): Promise<string> {
  // Block duplicate submissions while one is already pending for this plan —
  // the UI is supposed to hide the Apply button in this state, but guard
  // server-side too in case of a stale client.
  const existing = await getUserCoachingApplication(data.userId);
  if (existing && existing.planId === data.planId && existing.status === 'pending') {
    throw new Error('You already have a pending application for this plan.');
  }

  const ref = await addDoc(collection(db, 'coachingApplications'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  // Notify every admin so they know to review it.
  const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
  await Promise.all(
    adminSnap.docs.map((d) => sendNotification({
      userId: d.id,
      title: 'New 1:1 Coaching Application',
      body: `${data.userName} applied for "${data.planName}". Review it in Admin → Coaching Apps.`,
      type: 'manual',
      actionLabel: 'Review Application',
      actionUrl: '/admin?tab=coaching',
    }))
  );

  return ref.id;
}

// NOTE: sorted client-side rather than via Firestore orderBy() to avoid
// requiring a composite (userId + createdAt) index for a brand-new collection.
export async function getUserCoachingApplication(userId: string): Promise<CoachingApplication | null> {
  const snap = await getDocs(
    query(collection(db, 'coachingApplications'), where('userId', '==', userId), limit(50))
  );
  if (snap.empty) return null;
  const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CoachingApplication);
  apps.sort((a, b) => ((b.createdAt as Timestamp)?.toMillis() ?? 0) - ((a.createdAt as Timestamp)?.toMillis() ?? 0));
  return apps[0];
}

export async function getCoachingApplications(): Promise<CoachingApplication[]> {
  const snap = await getDocs(query(collection(db, 'coachingApplications'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CoachingApplication);
}

export async function approveCoachingApplication(app: CoachingApplication, reviewedBy: string): Promise<void> {
  await updateDoc(doc(db, 'coachingApplications', app.id), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    reviewedBy,
  });
  await sendNotification({
    userId: app.userId,
    title: "You're approved for 1:1 Coaching!",
    body: `Great news, ${app.userName}! Your application for "${app.planName}" has been approved. Tap below to complete your payment and get started.`,
    type: 'coaching_approved',
    actionLabel: 'Pay for 1:1 Coaching',
    actionUrl: `/profile?coachingPlanId=${app.planId}`,
  });
}

export async function rejectCoachingApplication(app: CoachingApplication, reviewedBy: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, 'coachingApplications', app.id), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    reviewedBy,
    ...(reason ? { rejectionReason: reason } : {}),
  });
  await sendNotification({
    userId: app.userId,
    title: '1:1 Coaching Application Update',
    body: reason
      ? `Thanks for applying, ${app.userName}. We're not able to take you on for 1:1 coaching right now: ${reason}`
      : `Thanks for applying, ${app.userName}. We're not able to take you on for 1:1 coaching right now — keep crushing your training and feel free to re-apply later.`,
    type: 'coaching_rejected',
  });
}

export async function getUserLastPostInChannel(channelId: string, userId: string): Promise<Date | null> {
  const snap = await getDoc(doc(db, 'channels', channelId, 'members', userId));
  if (!snap.exists()) return null;
  const ts = snap.data().lastPostAt;
  return ts ? (ts as { toDate: () => Date }).toDate() : null;
}

// ---------------------------------------------------------------------------
// Real-time recent activity feed (dashboard)
// ---------------------------------------------------------------------------

export interface ActivityItem {
  id: string;
  type: 'WORKOUT_COMPLETED' | 'MEAL_LOGGED' | 'WATER_LOGGED' | 'WEIGHT_RECORDED';
  label: string;
  sub: string;
  createdAt: Timestamp | null;
}

function normalizeActivityDoc(d: { id: string; data: () => Record<string, unknown> }): ActivityItem {
  const data = d.data();
  const type = data.type as ActivityItem['type'];
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const createdAt = (data.createdAt as Timestamp) ?? null;

  let label = 'Activity';
  let sub = '';

  if (type === 'WORKOUT_COMPLETED') {
    const dur = Number(payload.duration ?? 0);
    label = dur > 0 ? `${dur} min workout` : 'Workout completed';
    const exList = payload.exercises as unknown[] | undefined;
    sub = Array.isArray(exList) && exList.length > 0 ? `${exList.length} exercises` : 'Completed';
  } else if (type === 'MEAL_LOGGED') {
    label = String(payload.name || 'Meal logged');
    const cal = Number(payload.calories ?? 0);
    const mealType = String(payload.mealType || '');
    sub = [mealType, cal > 0 ? `${cal} kcal` : ''].filter(Boolean).join(' · ');
  } else if (type === 'WATER_LOGGED') {
    const ml = Number(payload.amountMl ?? 0);
    label = 'Water logged';
    sub = ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${ml} ml`;
  } else if (type === 'WEIGHT_RECORDED') {
    const kg = Number(payload.weightKg ?? 0);
    label = 'Weight recorded';
    sub = kg > 0 ? `${kg} kg` : '';
  }

  return { id: d.id, type, label, sub, createdAt };
}

export function subscribeRecentActivity(
  userId: string,
  onUpdate: (items: ActivityItem[]) => void,
  limitCount = 5,
): () => void {
  // Use only the auto-indexed single-field filter (no orderBy) so no composite
  // index is required. We fetch a window of recent docs and sort client-side.
  const FETCH_WINDOW = Math.max(limitCount * 10, 100);
  const q = query(
    collection(db, 'events'),
    where('userId', '==', userId),
    limit(FETCH_WINDOW),
  );

  const unsub = onSnapshot(q, (snap) => {
    const sorted = snap.docs
      .filter((d) => (d.data().createdAt as Timestamp | null) !== null)
      .sort((a, b) => {
        const ta = (a.data().createdAt as Timestamp).toMillis();
        const tb = (b.data().createdAt as Timestamp).toMillis();
        return tb - ta;
      })
      .slice(0, limitCount);

    onUpdate(sorted.map(normalizeActivityDoc));
  }, (err) => {
    console.error('[Firestore] subscribeRecentActivity error:', err);
  });

  return unsub;
}

// ---------------------------------------------------------------------------
// Legacy write stubs — kept only for backward-compat import references.
// These log a warning and are NOT used for new writes.
// All writes go through actions.ts → createEvent().
// ---------------------------------------------------------------------------
export async function logWorkout(..._args: unknown[]) {
  console.warn('[Firestore] logWorkout() called — use actions.completeWorkout() instead');
}
export async function logMeal(..._args: unknown[]) {
  console.warn('[Firestore] logMeal() called — use actions.logMealAction() instead');
}
export async function logWater(..._args: unknown[]) {
  console.warn('[Firestore] logWater() called — use actions.logWaterAction() instead');
}

// ---------------------------------------------------------------------------
// Exercise Video Library
// ---------------------------------------------------------------------------

export async function getExerciseVideos(): Promise<ExerciseVideo[]> {
  const snap = await getDocs(query(collection(db, 'exerciseLibrary'), orderBy('name', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExerciseVideo));
}

export async function saveExerciseVideo(
  video: Omit<ExerciseVideo, 'id' | 'uploadedAt'>,
  existingId?: string,
): Promise<string> {
  const payload = { ...video, uploadedAt: serverTimestamp() };
  if (existingId) {
    await setDoc(doc(db, 'exerciseLibrary', existingId), payload, { merge: true });
    return existingId;
  }
  const ref = await addDoc(collection(db, 'exerciseLibrary'), payload);
  return ref.id;
}

export async function deleteExerciseVideo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'exerciseLibrary', id));
}

/**
 * Given a list of exercise names (from AI-generated program), return a map of
 * name → videoUrl for any exercises that exist in the library.
 * Matching is case-insensitive; also checks aliases.
 */
const MATCH_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'for', 'to', 'on', 'of', 'in']);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !MATCH_STOPWORDS.has(w));
}

/**
 * Word-overlap similarity, not substring containment. Uploaded video names
 * are often verbose/specific (parsed from filenames, e.g. "45 Degree Bicycle
 * Twisting Crunches") while AI-generated exercise names are generic (e.g.
 * "Bicycle Crunch") — neither is a substring of the other despite clearly
 * being the same exercise, so a containment check alone misses almost every
 * real-world match. This scores by how much of the SHORTER name's word set
 * appears in the longer one.
 */
function nameSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shorter = setA.size <= setB.size ? setA : setB;
  const longer = setA.size <= setB.size ? setB : setA;
  let overlap = 0;
  shorter.forEach((word) => {
    if (longer.has(word)) overlap++;
  });
  return overlap / shorter.size;
}

export async function matchExercisesToVideos(
  exerciseNames: string[],
): Promise<Record<string, string>> {
  if (exerciseNames.length === 0) return {};
  const library = await getExerciseVideos();
  const result: Record<string, string> = {};

  for (const queryName of exerciseNames) {
    const normalized = queryName.toLowerCase().trim();
    let bestScore = 0;
    let bestUrl = '';

    for (const entry of library) {
      const candidates = [entry.name, ...(entry.aliases ?? [])];
      for (const candidate of candidates) {
        const c = candidate.toLowerCase().trim();
        // Exact match or full substring containment — cheap, high-confidence fast path
        if (c === normalized || normalized.includes(c) || c.includes(normalized)) {
          bestScore = 1;
          bestUrl = entry.videoUrl;
          break;
        }
        const score = nameSimilarity(normalized, c);
        if (score > bestScore) {
          bestScore = score;
          bestUrl = entry.videoUrl;
        }
      }
      if (bestScore === 1) break;
    }

    // Require at least half the shorter name's significant words to match —
    // loose enough to bridge naming-convention differences, tight enough to
    // avoid matching unrelated exercises that just share one common word.
    if (bestScore >= 0.5) {
      result[queryName] = bestUrl;
    }
  }
  return result;
}
