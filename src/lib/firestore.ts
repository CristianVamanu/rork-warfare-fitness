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
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import { stripUndefinedDeep } from './utils';
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
// Called from generateMetadata() in the root layout — i.e. on EVERY page
// request, server-side, for the whole site — plus a few individual pages.
// Next.js blocks the initial HTML response until metadata resolves (the
// tags land in <head>), so an unbounded network call here can hang every
// single route at once if Firestore is ever slow/unreachable from the
// server (flaky egress, DNS hiccup, throttling) — indistinguishable from a
// blank/black page in any browser, since the failure never reaches the
// client. The race guarantees callers' existing `.catch(() => null)`
// fallback fires within a bounded time instead of hanging indefinitely.
export async function getSystemConfig() {
  const snap = await Promise.race([
    getDoc(doc(db, 'system', 'config')),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getSystemConfig timed out')), 3000)),
  ]);
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

// ---------------------------------------------------------------------------
// B2B trainer leads — submitted from the /trainers landing page's demo form,
// reviewed manually in the admin panel (this is a sales-assisted,
// manually-provisioned offer, not self-serve).
// ---------------------------------------------------------------------------
import type { TrainerLead } from '@/types';

export async function createTrainerLead(data: {
  name: string; email: string; businessName?: string; phone?: string; message?: string; clientCount?: string;
}) {
  // Firestore's client SDK throws on any field whose value is literally
  // `undefined` (no ignoreUndefinedProperties configured) — the optional
  // fields here come straight from `x.trim() || undefined` on the form, so
  // every submission that left one blank threw and the form showed
  // "Something went wrong" with no lead ever saved.
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const leadRef = await addDoc(collection(db, 'trainerLeads'), {
    ...clean,
    status: 'new',
    createdAt: serverTimestamp(),
  });
  fetch('/api/email/trainer-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: leadRef.id, ...clean }),
  }).catch(() => {
    // Non-fatal — the lead is already saved and visible in the admin panel
    // even if the notification email fails to send.
  });
}

export async function getTrainerLeads(): Promise<TrainerLead[]> {
  const snap = await getDocs(query(collection(db, 'trainerLeads'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainerLead);
}

export async function updateTrainerLeadStatus(id: string, status: TrainerLead['status']) {
  await updateDoc(doc(db, 'trainerLeads', id), { status });
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

// ---------------------------------------------------------------------------
// Habit tracker
// ---------------------------------------------------------------------------
import type { HabitKey, HabitLog } from '@/types';

export async function toggleHabit(userId: string, date: string, habit: HabitKey, done: boolean): Promise<void> {
  const id = `${userId}_${date}`;
  await setDoc(
    doc(db, 'habitLogs', id),
    { userId, date, habits: { [habit]: done }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Last `days` habit logs for a user, most recent first (missing days simply absent). */
export async function getRecentHabitLogs(userId: string, days: number): Promise<HabitLog[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('sv-SE'));
  }
  const snaps = await Promise.all(
    dates.map((date) => getDoc(doc(db, 'habitLogs', `${userId}_${date}`)))
  );
  return snaps
    .filter((s) => s.exists())
    .map((s) => ({ id: s.id, ...s.data() } as HabitLog));
}

// ---------------------------------------------------------------------------
// Fasting timer
// ---------------------------------------------------------------------------
import type { FastingSession, DaysWithoutGoal } from '@/types';

export async function startFasting(userId: string, goalHours: number): Promise<void> {
  const session: FastingSession = { startedAt: serverTimestamp(), goalHours };
  await updateDoc(doc(db, 'users', userId), { fasting: session });
}

export async function stopFasting(userId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { fasting: deleteField() });
}

// ---------------------------------------------------------------------------
// "Days Without" streak goals (quit smoking, quit porn, custom, etc.)
// ---------------------------------------------------------------------------

export async function addDaysWithoutGoal(userId: string, label: string): Promise<void> {
  const snap = await getDoc(doc(db, 'users', userId));
  const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
  const goal: DaysWithoutGoal = {
    id: Math.random().toString(36).slice(2),
    label: label.trim().slice(0, 40),
    startedAt: Timestamp.now(),
  };
  await updateDoc(doc(db, 'users', userId), { daysWithoutGoals: [...goals, goal] });
}

export async function resetDaysWithoutGoal(userId: string, goalId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'users', userId));
  const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
  const updated = goals.map((g) => g.id === goalId ? { ...g, startedAt: Timestamp.now() } : g);
  await updateDoc(doc(db, 'users', userId), { daysWithoutGoals: updated });
}

export async function deleteDaysWithoutGoal(userId: string, goalId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'users', userId));
  const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
  await updateDoc(doc(db, 'users', userId), { daysWithoutGoals: goals.filter((g) => g.id !== goalId) });
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

// ---------------------------------------------------------------------------
// Weight history — recordWeight() emits a WEIGHT_RECORDED event on every
// log, this just reads them back oldest-first for a trend chart.
// ---------------------------------------------------------------------------

export async function getWeightHistory(userId: string, limitCount = 30): Promise<{ date: string; weightKg: number }[]> {
  const snap = await safeGetEvents(userId, 'WEIGHT_RECORDED', undefined, undefined, limitCount);
  return snap.docs
    .map((d) => {
      const payload = d.data().payload as Record<string, unknown>;
      const ts = d.data().createdAt as Timestamp | null;
      return {
        date: ts?.toDate?.().toISOString().slice(0, 10) ?? '',
        weightKg: Number(payload.weightKg ?? 0),
      };
    })
    .filter((e) => e.date && e.weightKg > 0)
    .reverse(); // safeGetEvents returns newest-first; chart wants oldest-first
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

/**
 * Per-set weight/reps from the most recent workout that included this
 * exercise (skipped sets excluded) — used to suggest next weight/reps at
 * the start of a set rather than always starting from zero. Returns null
 * if the exercise has never been logged before.
 */
export async function getLastExercisePerformance(userId: string, exerciseName: string): Promise<{ weight: number; reps: number }[] | null> {
  const target = exerciseName.trim().toLowerCase();
  if (!target) return null;
  const workouts = await getUserWorkouts(userId, 15) as unknown as UserWorkoutRecord[];
  for (const w of workouts) {
    const match = (w.exercises ?? []).find((ex) => String(ex.name ?? '').trim().toLowerCase() === target);
    if (!match) continue;
    const completedSets = (match.sets ?? []).filter((s) => s.completed && s.weight > 0);
    if (completedSets.length > 0) return completedSets.map((s) => ({ weight: s.weight, reps: s.reps }));
  }
  return null;
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

// Personal ("Build Your Own") programs are saved with visibility:'personal'
// and deliberately excluded from getPrograms() so they never show up in
// other users' browse lists — but that also meant a user who switched their
// active program away from a personal one had no way back to it: it wasn't
// deleted (enrollInProgram only ever reassigns the activeProgram pointer),
// just invisible. This surfaces the ones a given user owns so the training
// screen can list them separately and let the user re-select one.
export async function getUserCustomPrograms(uid: string) {
  const snap = await getDocs(collection(db, 'programs'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p.ownerId === uid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function getProgram(id: string) {
  const snap = await getDoc(doc(db, 'programs', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * THE single source of truth for what a program's schedule actually is.
 * Every screen that renders a program's days (dashboard next-workout card,
 * training list, program detail, live workout session) must resolve through
 * here — before this existed, each screen picked its own precedence between
 * the Firestore doc and the built-in seed copy (one even preferred the seed
 * OVER the admin's saved edits), so the home screen and the training screen
 * could disagree about what tomorrow's workout is.
 *
 * Precedence: the Firestore doc wins wherever it has data — an admin who
 * edited a built-in program saved their version there deliberately — and the
 * built-in seed fills any field the doc doesn't carry (e.g. a doc saved
 * before `phases` existed shouldn't erase the seed's phases).
 */
export async function resolveProgram(programId: string): Promise<Program | null> {
  const { getMockProgram } = await import('./programs');
  const mock = getMockProgram(programId);
  let fsDoc: Partial<Program> | null = null;
  try {
    fsDoc = await getProgram(programId) as Partial<Program> | null;
  } catch {
    // Offline / rules hiccup — the seed copy alone is still a valid answer
  }
  if (!fsDoc && !mock) return null;

  return {
    ...(mock ?? {}),
    ...(fsDoc ?? {}),
    schedule: fsDoc?.schedule?.length ? fsDoc.schedule : mock?.schedule,
    phases: fsDoc?.phases?.length ? fsDoc.phases : mock?.phases,
    exercises: fsDoc?.exercises?.length ? fsDoc.exercises : (mock?.exercises ?? []),
  } as Program;
}

export async function createProgram(data: Record<string, unknown>) {
  return addDoc(collection(db, 'programs'), { ...stripUndefinedDeep(data), createdAt: serverTimestamp() });
}

export async function updateProgram(id: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, 'programs', id), { ...stripUndefinedDeep(data), updatedAt: serverTimestamp() });
}

/**
 * Like updateProgram, but creates the doc if it doesn't exist yet — used
 * when an admin edits a built-in seed program (MOCK_PROGRAMS) for the first
 * time. Saving under the same id turns it into a real, editable Firestore
 * program that transparently overrides the seed version everywhere it's
 * looked up by id, without breaking any user already enrolled in it.
 */
export async function upsertProgram(id: string, data: Record<string, unknown>) {
  await setDoc(doc(db, 'programs', id), { ...stripUndefinedDeep(data), updatedAt: serverTimestamp() }, { merge: true });
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
  // Count REAL training days from the resolved schedule (phase-aware, rest
  // slots excluded) rather than trusting weeks × daysPerWeek — the two
  // drift apart on phased programs, and completedWorkouts (see
  // incrementProgramWorkouts) counts actual training sessions, so the
  // denominator must use the same unit or progress % lies.
  let totalWorkouts = program.weeks * program.daysPerWeek;
  try {
    const resolved = await resolveProgram(program.id);
    if (resolved) {
      const { getTotalTrainingDays } = await import('./programs');
      totalWorkouts = getTotalTrainingDays(resolved);
    }
  } catch { /* offline etc. — the approximation above is an acceptable fallback */ }
  // updateDoc (not setDoc+merge) — dotted field paths only reliably resolve
  // to nested fields with updateDoc; setDoc's merge doesn't parse dotted
  // string keys as paths, so a previous version of this using setDoc wrote
  // nothing where the rest of the app expected it (enroll/switch appeared
  // to silently do nothing). This also lets us explicitly delete any
  // leftover lastCompletedDayIndex from a prior enrollment in the same
  // write, so completedWorkouts (derived from it elsewhere) can't desync
  // from stale progress on re-enroll/switch.
  await updateDoc(doc(db, 'users', userId), {
    'activeProgram.programId': program.id,
    'activeProgram.programName': program.name,
    'activeProgram.enrolledAt': serverTimestamp(),
    'activeProgram.programStartDate': new Date().toISOString(),
    'activeProgram.completedWorkouts': 0,
    'activeProgram.totalWorkouts': totalWorkouts,
    'activeProgram.lastCompletedDayIndex': deleteField(),
    lastActive: serverTimestamp(),
  });
}

export async function unenrollProgram(userId: string) {
  await setDoc(
    doc(db, 'users', userId),
    { activeProgram: deleteField(), lastActive: serverTimestamp() },
    { merge: true }
  );
}

// lastCompletedDayIndex is the single source of truth for program progress;
// completedWorkouts is always derived from it (index + 1 = count of unique
// days done) in the same write, rather than tracked as a separately
// incremented counter — the previous version updated them independently,
// which meant any code path that forgot to touch one of them (or an
// enrollment reset that missed clearing the other) let them drift apart.
export async function incrementProgramWorkouts(userId: string, dayIndex?: number) {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists() || !snap.data()?.activeProgram) return;
  const activeProgram = snap.data()?.activeProgram;
  const lastCompleted: number = activeProgram?.lastCompletedDayIndex ?? -1;
  // Only advance when doing a genuinely new (later) day, not a repeat
  const isNewDay = dayIndex === undefined || dayIndex > lastCompleted;
  if (!isNewDay) return;
  const newLastCompleted = dayIndex !== undefined ? dayIndex : lastCompleted + 1;

  // completedWorkouts counts TRAINING sessions, not schedule slots — the
  // pointer index includes rest slots (and skipped-ahead rest days, see
  // getNextSession), so `index + 1` overstated progress the moment a
  // program's first rest day passed: a 4-day/week program showed 7 sessions
  // "done" after one calendar week. Recomputing from the schedule here also
  // self-heals any user whose stored count was inflated by the old formula
  // the next time they finish a workout.
  let completedTraining = newLastCompleted + 1;
  try {
    const resolved = await resolveProgram(activeProgram.programId);
    if (resolved) {
      const { countTrainingSlotsThrough } = await import('./programs');
      completedTraining = countTrainingSlotsThrough(resolved, newLastCompleted);
    }
  } catch { /* fall back to slot count rather than blocking the workout save */ }

  await updateDoc(doc(db, 'users', userId), {
    'activeProgram.completedWorkouts': completedTraining,
    'activeProgram.lastCompletedDayIndex': newLastCompleted,
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

// Real-time totals for events of one `type` today, for one user. Prefers
// the compound (userId, type, createdAt) index — but composite indexes
// have to be deployed separately from security rules (`firebase deploy
// --only firestore:indexes`), so a fresh environment that never ran that
// can be missing them even though firestore.indexes.json lists them. If
// the compound query errors as missing-index, this falls back to a
// userId-only live listener (always auto-indexed, no deploy needed) and
// filters/sums client-side instead — same fallback shape as
// `safeGetEvents`, just live instead of one-shot.
function subscribeTodayEventsTotal(
  userId: string,
  localDateStr: string,
  eventType: string,
  sumField: string,
  onUpdate: (total: number) => void,
): () => void {
  // 'T00:00:00' forces local-midnight parsing — without it, new Date(str)
  // parses a bare date string as UTC midnight, which in any non-UTC
  // timezone shifts the boundary by hours and disagrees with the other
  // today-boundary helpers below (getTodayWater/getTodayWaterLogs), causing
  // this live listener's total to silently diverge from the one-shot reads
  // used elsewhere (e.g. dashboard showing a different water total than
  // the nutrition page for the "same" day).
  const todayTs = Timestamp.fromDate(new Date(localDateStr + 'T00:00:00'));
  const compoundQ = query(
    collection(db, 'events'),
    where('userId', '==', userId),
    where('type', '==', eventType),
    where('createdAt', '>=', todayTs),
  );

  let fallbackUnsub: (() => void) | null = null;
  const unsub = onSnapshot(
    compoundQ,
    (snap) => {
      const total = snap.docs.reduce(
        (sum, d) => sum + (((d.data().payload) as Record<string, number>)?.[sumField] ?? 0),
        0,
      );
      onUpdate(total);
    },
    (err) => {
      if (err.code !== 'failed-precondition') {
        console.error(`[Firestore] subscribeTodayEventsTotal(${eventType}) error:`, err);
        return;
      }
      console.warn(`[Firestore] Missing index for live events type=${eventType} — using client-side filter fallback.`);
      const fallbackQ = query(collection(db, 'events'), where('userId', '==', userId));
      fallbackUnsub = onSnapshot(fallbackQ, (snap) => {
        const total = snap.docs.reduce((sum, d) => {
          const data = d.data();
          if (data.type !== eventType) return sum;
          const ts = data.createdAt as Timestamp | null;
          if (!ts || ts.toMillis() < todayTs.toMillis()) return sum;
          return sum + ((data.payload as Record<string, number>)?.[sumField] ?? 0);
        }, 0);
        onUpdate(total);
      }, (fallbackErr) => console.error(`[Firestore] subscribeTodayEventsTotal(${eventType}) fallback error:`, fallbackErr));
    },
  );

  return () => { unsub(); fallbackUnsub?.(); };
}

export function subscribeTodayCalories(
  userId: string,
  localDateStr: string,
  onUpdate: (calories: number) => void,
): () => void {
  return subscribeTodayEventsTotal(userId, localDateStr, 'MEAL_LOGGED', 'calories', onUpdate);
}

export function subscribeTodayWater(
  userId: string,
  localDateStr: string,
  onUpdate: (ml: number) => void,
): () => void {
  return subscribeTodayEventsTotal(userId, localDateStr, 'WATER_LOGGED', 'amountMl', onUpdate);
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

export async function markFlameIgnited(userId: string) {
  await updateDoc(doc(db, 'users', userId), { flameIgnited: true });
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

export async function unhideMockProgram(id: string) {
  const snap = await getDoc(doc(db, 'config', 'hiddenMocks'));
  const ids: string[] = snap.exists() ? (snap.data().ids ?? []) : [];
  if (ids.includes(id)) {
    await setDoc(doc(db, 'config', 'hiddenMocks'), { ids: ids.filter((x) => x !== id) }, { merge: true });
  }
}

// ---------------------------------------------------------------------------
// Membership configuration — stored at config/membership
// ---------------------------------------------------------------------------
import type { MembershipConfig, MembershipPlan } from '@/types';

export async function getMembershipConfig(): Promise<MembershipConfig | null> {
  const snap = await getDoc(doc(db, 'config', 'membership'));
  if (!snap.exists()) return null;
  return snap.data() as MembershipConfig;
}

export async function saveMembershipConfig(data: Partial<MembershipConfig>) {
  await setDoc(doc(db, 'config', 'membership'), data, { merge: true });
}

// ---------------------------------------------------------------------------
// Membership plans — multiple, fully admin-editable pricing tiers, each with
// its own feature access. Stored at config/membershipPlans, same shape as
// coachingPlans but intentionally a separate collection: coaching plans are
// a 1:1 coaching application (manually reviewed), these are instant
// self-serve subscriptions.
// ---------------------------------------------------------------------------
export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  const snap = await getDoc(doc(db, 'config', 'membershipPlans'));
  return (snap.data()?.plans as MembershipPlan[]) ?? [];
}

export async function saveMembershipPlans(plans: MembershipPlan[]): Promise<void> {
  await setDoc(doc(db, 'config', 'membershipPlans'), { plans });
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

export async function deleteNotification(notifId: string) {
  await deleteDoc(doc(db, 'notifications', notifId));
}

export async function deleteAllReadNotifications(userId: string) {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', true))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
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

export async function deleteChannel(id: string) {
  await deleteDoc(doc(db, 'channels', id));
}

export async function getChannelPosts(channelId: string): Promise<ChannelPost[]> {
  const snap = await getDocs(
    query(collection(db, 'channels', channelId, 'posts'), orderBy('createdAt', 'desc'), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, channelId, ...d.data() }) as ChannelPost).reverse();
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
  await updateDoc(ref, { likes: liked ? arrayUnion(userId) : arrayRemove(userId) });
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
  totalWeightLifted: number;
  questsCompleted: string[];
}

function mapToLeaderboardEntry(id: string, data: Record<string, unknown>): LeaderboardEntry {
  return {
    id,
    displayName: (data.displayName as string) || 'Athlete',
    xp: (data.xp as number) ?? 0,
    powerLevel: (data.powerLevel as number) ?? 0,
    streak: (data.statsCache as Record<string, number> | undefined)?.streak ?? (data.stats as Record<string, number> | undefined)?.streak ?? 0,
    totalWorkouts: (data.statsCache as Record<string, number> | undefined)?.totalWorkouts ?? (data.stats as Record<string, number> | undefined)?.totalWorkouts ?? 0,
    totalWeightLifted: (data.stats as Record<string, number> | undefined)?.totalWeightLifted ?? 0,
    questsCompleted: (data.questsCompleted as string[]) ?? [],
  };
}

// NOTE: This app is currently single-tenant (one trainer per install), so the
// leaderboard intentionally shows every user rather than filtering by
// trainerId — that filter was fragile (any mismatch between a user's stored
// trainerId and the live admin uid made them silently invisible) and adds no
// value with only one trainer. Revisit if true multi-tenant coaching ships.
export async function getLeaderboard(limitCount = 10): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(query(collection(db, 'users'), limit(200)));
  const entries = snap.docs
    .filter((d) => !d.data().banned)
    .map((d) => mapToLeaderboardEntry(d.id, d.data()))
    .filter((e) => e.totalWorkouts > 0);
  return entries.sort((a, b) => b.xp - a.xp).slice(0, limitCount);
}

export function subscribeLeaderboard(
  onUpdate: (entries: LeaderboardEntry[]) => void,
  limitCount = 10,
): () => void {
  const q = query(collection(db, 'users'), limit(200));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs
      .filter((d) => !d.data().banned)
      .map((d) => mapToLeaderboardEntry(d.id, d.data()))
      .filter((e) => e.totalWorkouts > 0);
    onUpdate(entries.sort((a, b) => b.xp - a.xp).slice(0, limitCount));
  }, (err) => console.error('[Firestore] subscribeLeaderboard error:', err));
}

// ── PR Wall — community-posted personal records with a trust/verification badge ──
import type { VerificationLevel, PRPost } from '@/types';

export async function createPRPost(input: {
  userId: string;
  displayName: string;
  photoURL: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number;
  note?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  verificationLevel: VerificationLevel;
}): Promise<string> {
  // addDoc rejects `undefined` field values outright — strip optional fields
  // the caller left unset (no note, no media) instead of writing undefined.
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db, 'prPosts'), {
    ...clean,
    moderationStatus: 'pending',
    likeCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** All PRs, unfiltered — for the admin review queue. */
export async function getAllPRPosts(limitCount = 100): Promise<PRPost[]> {
  const q = query(collection(db, 'prPosts'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PRPost, 'id'>) }));
}

export function subscribeAllPRPosts(onUpdate: (posts: PRPost[]) => void, limitCount = 100): () => void {
  const q = query(collection(db, 'prPosts'), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PRPost, 'id'>) })));
  }, (err) => console.error('[Firestore] subscribeAllPRPosts error:', err));
}

/** Public feed for the PR Wall — a post only shows to the whole community
 * once an admin has approved it. Filtered client-side (not with a Firestore
 * `where`) so this doesn't need a composite index provisioned. `viewerId`
 * lets a user see their own still-pending post so uploading doesn't feel
 * like it silently vanished. */
export function subscribePRFeed(
  onUpdate: (posts: PRPost[]) => void,
  viewerId: string | null,
  limitCount = 30,
): () => void {
  const q = query(collection(db, 'prPosts'), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PRPost, 'id'>) }));
    onUpdate(all.filter((p) => p.moderationStatus === 'approved' || p.userId === viewerId));
  }, (err) => console.error('[Firestore] subscribePRFeed error:', err));
}

export async function likePRPost(postId: string, userId: string, liked: boolean) {
  await updateDoc(doc(db, 'prPosts', postId), {
    likeCount: increment(liked ? 1 : -1),
    likedBy: liked ? arrayUnion(userId) : arrayRemove(userId),
  });
}

/** Admin approve/reject — a post only reaches the public feed once approved.
 * Approving is also what verifies it — the badge lives on this specific
 * post only, not on the athlete's profile as a whole. Proving one lift is
 * real doesn't vouch for every future post, so nothing here touches the
 * user's own profile. Also notifies the poster of the decision (skipped
 * for a reset back to 'pending', which isn't a real decision). */
export async function setPRPostModeration(
  postId: string,
  status: 'pending' | 'approved' | 'rejected',
  post?: { userId: string; exerciseName: string },
) {
  await updateDoc(doc(db, 'prPosts', postId), {
    moderationStatus: status,
    verificationLevel: status === 'approved' ? 'verified' : 'unverified',
  });

  if (post && (status === 'approved' || status === 'rejected')) {
    await sendNotification({
      userId: post.userId,
      title: status === 'approved' ? '🏅 Your PR was verified!' : 'Your PR submission was rejected',
      body: status === 'approved'
        ? `Your "${post.exerciseName}" PR is now live on the PR Wall with a Verified badge.`
        : `Your "${post.exerciseName}" PR wasn't approved for the PR Wall. You can post a new one anytime.`,
      type: status === 'approved' ? 'pr_approved' : 'pr_rejected',
      actionLabel: 'View PR Wall',
      actionUrl: '/community/prs',
    }).catch(() => {});
  }
}

export async function deletePRPost(postId: string) {
  await deleteDoc(doc(db, 'prPosts', postId));
}

/** Bans a user from posting to the PR Wall. `days: null` bans indefinitely. */
export async function banUserFromPRWall(userId: string, days: number | null) {
  const until = days === null ? null : Timestamp.fromMillis(Date.now() + days * 86_400_000);
  await updateDoc(doc(db, 'users', userId), { prBan: { until, bannedAt: serverTimestamp() } });
}

export async function unbanUserFromPRWall(userId: string) {
  await updateDoc(doc(db, 'users', userId), { prBan: deleteField() });
}

// ── Body progress photos — private to the owner + admin/trainer, never public ──
import type { ProgressPhoto } from '@/types';

export async function createProgressPhoto(input: {
  userId: string;
  photoUrl: string;
  note?: string;
  weightKg?: number;
}): Promise<string> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db, 'progressPhotos'), {
    ...clean,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Sorted client-side, not with a Firestore `orderBy`, so this stays an
// equality-only query and never needs a manually-deployed composite index
// (the same class of bug that silently broke the calories/water listeners
// earlier — a where()+orderBy() combo needs an index that's easy to forget
// to actually deploy, and the failure is silent unless you check the console).
function sortByCreatedAtDesc(photos: ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort((a, b) => {
    const am = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const bm = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return bm - am;
  });
}

export async function getProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
  const q = query(collection(db, 'progressPhotos'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProgressPhoto, 'id'>) })));
}

export function subscribeProgressPhotos(userId: string, onUpdate: (photos: ProgressPhoto[]) => void): () => void {
  const q = query(collection(db, 'progressPhotos'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    onUpdate(sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProgressPhoto, 'id'>) }))));
  }, (err) => console.error('[Firestore] subscribeProgressPhotos error:', err));
}

export async function deleteProgressPhoto(photoId: string) {
  await deleteDoc(doc(db, 'progressPhotos', photoId));
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
// Client Goals — trainer/admin sets a target for a specific client, client
// checks in on their own progress. Top-level collection (like prPosts/
// progressPhotos) rather than a user subcollection so admin can list/manage
// across clients without per-user subcollection queries.
// ---------------------------------------------------------------------------
import type { ClientGoal } from '@/types';

export async function createGoal(data: Omit<ClientGoal, 'id' | 'createdAt' | 'status'>): Promise<string> {
  const ref = await addDoc(collection(db, 'goals'), {
    ...data,
    status: 'active',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getClientGoals(userId: string): Promise<ClientGoal[]> {
  const snap = await getDocs(query(collection(db, 'goals'), where('userId', '==', userId), limit(100)));
  const goals = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientGoal);
  return goals.sort((a, b) => ((b.createdAt as Timestamp)?.toMillis() ?? 0) - ((a.createdAt as Timestamp)?.toMillis() ?? 0));
}

export async function updateGoalProgress(goalId: string, currentValue: number): Promise<void> {
  await updateDoc(doc(db, 'goals', goalId), { currentValue });
}

export async function setGoalStatus(goalId: string, status: ClientGoal['status']): Promise<void> {
  await updateDoc(doc(db, 'goals', goalId), {
    status,
    ...(status === 'completed' ? { completedAt: serverTimestamp() } : {}),
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  await deleteDoc(doc(db, 'goals', goalId));
}

// ---------------------------------------------------------------------------
// PT Test results — simplified 3-event military-style fitness test
// (push-ups, sit-ups, timed run), see PtTestResult for scoring notes.
// ---------------------------------------------------------------------------
import type { PtTestResult } from '@/types';

export async function createPtTestResult(data: Omit<PtTestResult, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'ptTestResults'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPtTestResults(userId: string): Promise<PtTestResult[]> {
  const snap = await getDocs(query(collection(db, 'ptTestResults'), where('userId', '==', userId), limit(50)));
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PtTestResult);
  return results.sort((a, b) => ((b.createdAt as Timestamp)?.toMillis() ?? 0) - ((a.createdAt as Timestamp)?.toMillis() ?? 0));
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

export async function updateExerciseVideoThumbnail(id: string, thumbnailUrl: string): Promise<void> {
  await updateDoc(doc(db, 'exerciseLibrary', id), { thumbnailUrl });
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
