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
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserGoals } from '@/types';

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
  const { deleteField } = await import('firebase/firestore');
  await setDoc(
    doc(db, 'users', userId),
    { activeProgram: deleteField(), lastActive: serverTimestamp() },
    { merge: true }
  );
}

export async function incrementProgramWorkouts(userId: string) {
  // Check program is still active before incrementing
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists() || !snap.data()?.activeProgram) return;
  await updateDoc(doc(db, 'users', userId), {
    'activeProgram.completedWorkouts': increment(1),
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

export async function getUserNotifications(userId: string): Promise<AppNotification[]> {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
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
  return addDoc(collection(db, 'channels'), { ...data, postCount: 0, createdAt: serverTimestamp() });
}

export async function updateChannel(id: string, data: Partial<Channel>) {
  await updateDoc(doc(db, 'channels', id), data);
}

export async function deleteChannel(id: string) {
  await deleteDoc(doc(db, 'channels', id));
}

export async function getChannelPosts(channelId: string): Promise<ChannelPost[]> {
  const snap = await getDocs(
    query(collection(db, 'channels', channelId, 'posts'), orderBy('createdAt', 'desc'), limit(50))
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

export async function getUserLastPostInChannel(channelId: string, userId: string): Promise<Date | null> {
  const snap = await getDoc(doc(db, 'channels', channelId, 'members', userId));
  if (!snap.exists()) return null;
  const ts = snap.data().lastPostAt;
  return ts ? (ts as { toDate: () => Date }).toDate() : null;
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
