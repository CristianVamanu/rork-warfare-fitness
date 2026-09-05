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
  runTransaction,
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
  getCountFromServer,
} from 'firebase/firestore';
import * as Sentry from '@sentry/nextjs';
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
  // Compound query — requires deployed composite index.
  // orderBy is ALWAYS applied, not just when a date range is given. Without
  // it, Firestore returns matches in document-ID order — and event IDs are
  // random (see createEvent's addDoc) — so any caller passing `limitN`
  // without `fromTs` got an arbitrary N events rather than the newest N.
  // That silently corrupted every "recent" read in the app: recent workouts
  // and the weekly summary could miss today's session entirely, personal
  // bests missed the actual best, the session player's progressive-overload
  // suggestion read a random old session (so it could suggest going DOWN in
  // weight), and the weight chart plotted points out of chronological order.
  const compoundConstraints = [
    where('userId', '==', userId),
    where('type', '==', type),
    ...(fromTs ? [where('createdAt', '>=', fromTs)] : []),
    ...(toTs ? [where('createdAt', '<=', toTs)] : []),
    orderBy('createdAt', 'desc'),
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
    //
    // This is a correctness backstop, NOT a viable steady state. It downloads
    // every event this user has ever created — every workout, set, meal, water
    // log and weigh-in — and filters in the browser, on every call. Views that
    // make several of these (nutrition does meals + water, then again on the
    // analyze screen) therefore pull the whole history several times per page,
    // and it degrades a little more with every day the account is used. The
    // symptom is "the tab takes forever to load", getting steadily worse, with
    // nothing failing outright — which is exactly why this needs to be louder
    // than a console.warn nobody scrolls back far enough to see.
    //
    // The composite indexes it wants ARE defined in firestore.indexes.json;
    // they just have to be PUBLISHED, and deploy.sh does not do that (same as
    // firestore.rules). Two ways: `firebase deploy --only firestore:indexes`,
    // or click the console link Firestore puts inside its own error message —
    // it opens the Add-index form with every field pre-filled.
    //
    // That link is the whole reason the ORIGINAL error is logged below and not
    // just this summary. Replacing Firestore's message with our own wording
    // reads better and throws away the one-click fix, which is the opposite of
    // helpful when the person reading the console would rather not touch a
    // terminal at all.
    const msg = `[Firestore] Missing composite index for events type=${type} — falling back to a full client-side scan of this user's events. Fix: open the console.firebase.google.com link in the error below and click Create, or run: firebase deploy --only firestore:indexes`;
    console.error(msg);
    console.error(e);
    // Reported as an error, not a breadcrumb, so a silent performance cliff in
    // production shows up somewhere it will actually be noticed.
    Sentry.captureException(new Error(msg), { level: 'warning', tags: { area: 'firestore-index', eventType: type } });
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

// Shared by src/lib/auth.ts's signUp() and AuthContext's ensureUserDoc() —
// both create a fresh user doc right after createUserWithEmailAndPassword
// and can race each other (onAuthStateChanged fires immediately). Firestore
// rules forbid trainerId from ever changing on update, so if the two
// writers resolved it differently, whichever write landed second would get
// rejected as an unauthorized "change" to an already-set field. A single
// shared resolver makes that agreement structural instead of relying on two
// independent copies of the same three lines staying in sync by hand.
export async function resolveTrainerId(): Promise<string | null> {
  try {
    const cfg = await getSystemConfig();
    return (cfg?.trainerId as string) ?? null;
  } catch {
    return null; // Non-fatal: trainerId will be null for legacy installs / offline
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
import type { TrainerLead, LandingLead } from '@/types';

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

// ---------------------------------------------------------------------------
// Landing page exit-intent lead capture — a visitor's email before they
// abandon the quiz, so there's something to retarget/nurture instead of
// losing them entirely. See LandingLead in types/index.ts.
// ---------------------------------------------------------------------------
export async function createLandingLead(email: string) {
  await addDoc(collection(db, 'landingLeads'), { email, createdAt: serverTimestamp() });
}

export async function getLandingLeads(): Promise<LandingLead[]> {
  const snap = await getDocs(query(collection(db, 'landingLeads'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LandingLead);
}

export async function getTrainerLeads(): Promise<TrainerLead[]> {
  const snap = await getDocs(query(collection(db, 'trainerLeads'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TrainerLead);
}

export async function updateTrainerLeadStatus(id: string, status: TrainerLead['status']) {
  await updateDoc(doc(db, 'trainerLeads', id), { status });
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

// All three below use runTransaction (not a plain getDoc-then-updateDoc)
// because that read-modify-write pattern is a classic lost-update race:
// two tabs (or a fast double-tap) reading the same array both compute
// their own "next" array from the same stale snapshot, and whichever
// write lands second silently discards the first's change. A transaction
// re-reads and retries automatically on conflict instead.
export async function addDaysWithoutGoal(userId: string, label: string): Promise<void> {
  const goal: DaysWithoutGoal = {
    id: Math.random().toString(36).slice(2),
    label: label.trim().slice(0, 40),
    startedAt: Timestamp.now(),
  };
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
    tx.update(userRef, { daysWithoutGoals: [...goals, goal] });
  });
}

export async function resetDaysWithoutGoal(userId: string, goalId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
    const updated = goals.map((g) => g.id === goalId ? { ...g, startedAt: Timestamp.now() } : g);
    tx.update(userRef, { daysWithoutGoals: updated });
  });
}

export async function deleteDaysWithoutGoal(userId: string, goalId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const goals = (snap.data()?.daysWithoutGoals as DaysWithoutGoal[]) ?? [];
    tx.update(userRef, { daysWithoutGoals: goals.filter((g) => g.id !== goalId) });
  });
}

export const DEFAULT_USER_GOALS: UserGoals = {
  calories: 2200,
  protein: 160,
  carbs: 250,
  fat: 70,
  water: 3000,
};

/**
 * Re-reads users/{uid} purely for its `goals` field. Prefer reading
 * `profile.goals` directly anywhere the profile is already in hand —
 * AuthContext streams that exact document live via onSnapshot, so calling
 * this there is a second fetch of a document you already have (the dashboard
 * used to do exactly that). Still correct for callers without a profile.
 */
export async function getUserGoals(uid: string): Promise<UserGoals> {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data();
  return (data?.goals as UserGoals) ?? DEFAULT_USER_GOALS;
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
export async function deleteMeal(id: string, userId: string) {
  // Firestore's deleteDoc on a doc that doesn't exist succeeds silently
  // (it's a no-op, not an error) — the previous try/catch here assumed a
  // missing 'events' doc would throw and fall through to the legacy
  // 'meals' collection, but it never did. Any pre-migration meal id just
  // "succeeded" without deleting anything, and the meal reappeared on the
  // next load. Checking existence first makes the fallback actually reachable.
  const eventRef = doc(db, 'events', id);
  const eventSnap = await getDoc(eventRef);
  if (eventSnap.exists()) {
    await deleteDoc(eventRef);
  } else {
    await deleteDoc(doc(db, 'meals', id));
  }
  // logMealAction increments this on create; without a matching decrement
  // here, repeatedly logging-then-deleting meals inflates
  // totalMealsLogged forever, unlocking nutrition achievements/quests for
  // meals that no longer exist.
  await updateDoc(doc(db, 'users', userId), {
    'stats.totalMealsLogged': increment(-1),
  }).catch(() => {
    // Non-critical — background recompute self-heals the count
  });
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
  // Same fix as deleteMeal above — deleteDoc on a nonexistent doc SUCCEEDS
  // (it's a no-op, not an error), so the previous try/catch's legacy
  // fallback was unreachable: a pre-migration waterLogs id "succeeded"
  // against 'events' without deleting anything, and the entry reappeared on
  // the next load. Check existence first so the fallback actually runs.
  const eventRef = doc(db, 'events', id);
  const eventSnap = await getDoc(eventRef);
  if (eventSnap.exists()) {
    await deleteDoc(eventRef);
  } else {
    await deleteDoc(doc(db, 'waterLogs', id));
  }
}

// ---------------------------------------------------------------------------
// Workout history — event-primary reads with legacy fallback
// ---------------------------------------------------------------------------

// Workout event documents are the heaviest thing the dashboard reads — each
// one carries the full set-by-set `payload.exercises` log. The dashboard used
// to fetch them TWICE on every mount: getWeeklySummary(20) and, waterfalled
// behind resolveProgram, getPersonalBest(30) — ~50 heavy docs for what is one
// underlying "most recent N workouts" query. This caches the largest fetch per
// user for a short window and serves any smaller N as a slice of it, and dedupes
// concurrent callers onto a single in-flight promise. Invalidated explicitly on
// workout completion (see invalidateWorkoutsCache) so a just-finished workout
// shows up immediately rather than after the TTL.
const WORKOUTS_CACHE_TTL_MS = 30_000;
type UserWorkoutRow = Awaited<ReturnType<typeof fetchUserWorkouts>>[number];
let workoutsCache: { userId: string; limit: number; rows: UserWorkoutRow[]; fetchedAt: number } | null = null;
let workoutsInFlight: { userId: string; limit: number; promise: Promise<UserWorkoutRow[]> } | null = null;
let workoutsGeneration = 0;

/** Clears the cached recent-workout list so the next read hits Firestore. */
export function invalidateWorkoutsCache() {
  workoutsCache = null;
  workoutsGeneration++;
}

export async function getUserWorkouts(userId: string, limitCount = 10): Promise<UserWorkoutRow[]> {
  if (
    workoutsCache &&
    workoutsCache.userId === userId &&
    workoutsCache.limit >= limitCount &&
    Date.now() - workoutsCache.fetchedAt < WORKOUTS_CACHE_TTL_MS
  ) {
    return workoutsCache.rows.slice(0, limitCount);
  }

  // Reuse an in-flight fetch only when it will cover this caller's window.
  if (workoutsInFlight && workoutsInFlight.userId === userId && workoutsInFlight.limit >= limitCount) {
    return (await workoutsInFlight.promise).slice(0, limitCount);
  }

  const startedAtGeneration = workoutsGeneration;
  const promise = fetchUserWorkouts(userId, limitCount)
    .then((rows) => {
      if (startedAtGeneration === workoutsGeneration) {
        workoutsCache = { userId, limit: limitCount, rows, fetchedAt: Date.now() };
      }
      if (workoutsInFlight?.promise === promise) workoutsInFlight = null;
      return rows;
    })
    .catch((err) => {
      if (workoutsInFlight?.promise === promise) workoutsInFlight = null;
      throw err;
    });
  workoutsInFlight = { userId, limit: limitCount, promise };
  return promise;
}

async function fetchUserWorkouts(userId: string, limitCount: number) {
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
  // 30, not 20, deliberately: getPersonalBest below asks for 30 and the two
  // run on the same dashboard mount. Matching the window lets both share one
  // cached fetch (see getUserWorkouts) — 30 heavy documents total instead of
  // 50 — and only the last 7 days are summed here regardless.
  const workouts = await getUserWorkouts(userId, 30) as unknown as UserWorkoutRecord[];
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
// Program docs carry full exercise schedules/phases, so a full collection
// scan isn't cheap — and the Training tab used to trigger TWO of them on
// every visit (getPrograms + getUserCustomPrograms each doing their own
// independent getDocs over the same collection), with no caching at all.
// Share one cached raw fetch between both instead.
let programsCache: { all: Record<string, unknown>[]; fetchedAt: number } | null = null;
let programsInFlight: Promise<Record<string, unknown>[]> | null = null;
// Bumped by every invalidation. A fetch that was already in flight when an
// invalidation happened captures the generation it started under, and
// refuses to populate the cache if that no longer matches — otherwise an
// admin saving an edit mid-load would have the pre-edit snapshot written
// into the cache by the still-pending read a moment later, making their
// own change invisible for the full TTL (the exact "I saved it but it's
// not showing up" symptom this cache was supposed to avoid causing).
let programsGeneration = 0;
const PROGRAMS_CACHE_TTL_MS = 30_000;

async function fetchAllPrograms(): Promise<Record<string, unknown>[]> {
  if (programsCache && Date.now() - programsCache.fetchedAt < PROGRAMS_CACHE_TTL_MS) {
    return programsCache.all;
  }
  if (programsInFlight) return programsInFlight;
  const startedAtGeneration = programsGeneration;
  programsInFlight = getDocs(collection(db, 'programs')).then((snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (startedAtGeneration === programsGeneration) {
      programsCache = { all, fetchedAt: Date.now() };
    }
    programsInFlight = null;
    return all;
  }).catch((err) => { programsInFlight = null; throw err; });
  return programsInFlight;
}

export function invalidateProgramsCache() {
  programsCache = null;
  programsGeneration++;
}

export async function getPrograms(trainerId?: string) {
  // Full collection scan + client-side filter avoids composite index requirement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = await fetchAllPrograms() as any[];
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
  const all = await fetchAllPrograms();
  return all
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
  const ref = await addDoc(collection(db, 'programs'), { ...stripUndefinedDeep(data), createdAt: serverTimestamp() });
  invalidateProgramsCache();
  return ref;
}

export async function updateProgram(id: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, 'programs', id), { ...stripUndefinedDeep(data), updatedAt: serverTimestamp() });
  invalidateProgramsCache();
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
  invalidateProgramsCache();
}

export async function deleteProgram(id: string) {
  await deleteDoc(doc(db, 'programs', id));
  invalidateProgramsCache();
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

// Switching programs used to be destructive: it always reset
// completedWorkouts to 0 and deleted lastCompletedDayIndex, so a user who'd
// gotten to Week 6 of one program and tried a different one for a day lost
// that position permanently. Now every program's progress is preserved
// under `programProgress[programId]` the moment the user switches away from
// it, and switching BACK to a program restores its saved position instead
// of starting over — `activeProgram` still mirrors whichever program is
// currently active (unchanged shape), so every existing screen that reads
// `profile.activeProgram.*` keeps working with no further changes.
export async function enrollInProgram(
  userId: string,
  program: { id: string; name: string; weeks: number; daysPerWeek: number },
  // True when the user explicitly chose "Restart from Day 1" over "Resume"
  // on a program that already has saved progress (either currently active,
  // or left mid-way via a prior switch — see programProgress below).
  // Without this, switching away from a program to test another one and
  // back always silently resumed old progress, which is the right default
  // but had no escape hatch for someone who genuinely wanted a clean start.
  restart = false
) {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const data = snap.data() ?? {};
  const current = data.activeProgram as
    | { programId?: string; programName?: string; enrolledAt?: unknown; programStartDate?: string; completedWorkouts?: number; totalWorkouts?: number; lastCompletedDayIndex?: number }
    | undefined;
  const savedProgress = (data.programProgress ?? {}) as Record<string, {
    programName: string; enrolledAt?: unknown; programStartDate?: string;
    completedWorkouts: number; totalWorkouts: number; lastCompletedDayIndex?: number;
  }>;

  const updates: Record<string, unknown> = {};

  // Save the program we're leaving, if any and if it's actually a
  // different one (re-enrolling in the same program is a no-op switch).
  // This also opportunistically "migrates" an existing user's first-ever
  // switch — they never had a programProgress map before this change, but
  // whatever's live in activeProgram right now is captured here regardless.
  if (current?.programId && current.programId !== program.id) {
    updates[`programProgress.${current.programId}`] = {
      programName: current.programName ?? '',
      enrolledAt: current.enrolledAt ?? serverTimestamp(),
      programStartDate: current.programStartDate,
      completedWorkouts: current.completedWorkouts ?? 0,
      totalWorkouts: current.totalWorkouts ?? 0,
      ...(current.lastCompletedDayIndex !== undefined ? { lastCompletedDayIndex: current.lastCompletedDayIndex } : {}),
    };
  }

  // Resume the target program's own saved position if it has one;
  // otherwise this is a genuinely fresh start for it. `restart` forces the
  // fresh-start path even when a saved position exists.
  const saved = restart || program.id === current?.programId ? undefined : savedProgress[program.id];

  // Count REAL training days from the resolved schedule (phase-aware, rest
  // slots excluded) rather than trusting weeks × daysPerWeek — the two
  // drift apart on phased programs, and completedWorkouts (see
  // incrementProgramWorkouts) counts actual training sessions, so the
  // denominator must use the same unit or progress % lies. Recomputed even
  // for a resumed program in case an admin edited its schedule since the
  // last time the user was on it.
  let totalWorkouts = saved?.totalWorkouts ?? program.weeks * program.daysPerWeek;
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
  // to silently do nothing).
  updates['activeProgram.programId'] = program.id;
  updates['activeProgram.programName'] = program.name;
  updates['activeProgram.enrolledAt'] = saved?.enrolledAt ?? serverTimestamp();
  updates['activeProgram.programStartDate'] = saved?.programStartDate ?? new Date().toISOString();
  updates['activeProgram.completedWorkouts'] = saved?.completedWorkouts ?? 0;
  updates['activeProgram.totalWorkouts'] = totalWorkouts;
  // Explicitly deleted when there's no saved position (fresh start), same
  // as before — completedWorkouts (derived from it elsewhere) can't desync
  // from stale progress left over from whatever was active previously.
  updates['activeProgram.lastCompletedDayIndex'] = saved?.lastCompletedDayIndex !== undefined
    ? saved.lastCompletedDayIndex
    : deleteField();
  // The program being resumed is no longer "unswitched-from" progress —
  // clear its now-stale saved snapshot so activeProgram is unambiguously
  // the live source of truth for it again (avoids the two ever drifting
  // apart while it's the active one).
  if (program.id in savedProgress) {
    updates[`programProgress.${program.id}`] = deleteField();
  }
  updates['lastActive'] = serverTimestamp();

  // Firestore's UpdateData typing can't express a dynamically-built object
  // of dotted field paths (some deleteField() sentinels, some plain
  // values) — this is the same shape of update every other dotted-path
  // write in this file does inline, just built up conditionally first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateDoc(userRef, updates as any);
}

// Currently unused (no UI wires up "leave program" without switching to
// another one), but kept aligned with enrollInProgram's non-destructive
// design rather than left as dead code that would silently wipe progress
// with no way to recover it the moment something DOES call it.
export async function unenrollProgram(userId: string) {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const current = snap.data()?.activeProgram as
    | { programId?: string; programName?: string; enrolledAt?: unknown; programStartDate?: string; completedWorkouts?: number; totalWorkouts?: number; lastCompletedDayIndex?: number }
    | undefined;

  const updates: Record<string, unknown> = { activeProgram: deleteField(), lastActive: serverTimestamp() };
  if (current?.programId) {
    updates[`programProgress.${current.programId}`] = {
      programName: current.programName ?? '',
      enrolledAt: current.enrolledAt ?? serverTimestamp(),
      programStartDate: current.programStartDate,
      completedWorkouts: current.completedWorkouts ?? 0,
      totalWorkouts: current.totalWorkouts ?? 0,
      ...(current.lastCompletedDayIndex !== undefined ? { lastCompletedDayIndex: current.lastCompletedDayIndex } : {}),
    };
  }

  await setDoc(userRef, updates, { merge: true });
}

/**
 * All programs the user has ever made progress on, keyed by programId —
 * merges the live `activeProgram` (if any) with the saved `programProgress`
 * map, for a "My Programs" screen that needs to show every program's
 * position regardless of which one is currently active.
 */
export async function getAllProgramProgress(userId: string): Promise<Record<string, {
  programName: string; completedWorkouts: number; totalWorkouts: number;
  lastCompletedDayIndex?: number; isActive: boolean;
}>> {
  const snap = await getDoc(doc(db, 'users', userId));
  const data = snap.data() ?? {};
  const active = data.activeProgram as { programId?: string; programName?: string; completedWorkouts?: number; totalWorkouts?: number; lastCompletedDayIndex?: number } | undefined;
  const saved = (data.programProgress ?? {}) as Record<string, { programName: string; completedWorkouts: number; totalWorkouts: number; lastCompletedDayIndex?: number }>;

  const result: Record<string, { programName: string; completedWorkouts: number; totalWorkouts: number; lastCompletedDayIndex?: number; isActive: boolean }> = {};
  for (const [id, p] of Object.entries(saved)) {
    result[id] = { ...p, isActive: false };
  }
  if (active?.programId) {
    result[active.programId] = {
      programName: active.programName ?? '',
      completedWorkouts: active.completedWorkouts ?? 0,
      totalWorkouts: active.totalWorkouts ?? 0,
      lastCompletedDayIndex: active.lastCompletedDayIndex,
      isActive: true,
    };
  }
  return result;
}

// lastCompletedDayIndex is the single source of truth for program progress;
// completedWorkouts is always derived from it (index + 1 = count of unique
// days done) in the same write, rather than tracked as a separately
// incremented counter — the previous version updated them independently,
// which meant any code path that forgot to touch one of them (or an
// enrollment reset that missed clearing the other) let them drift apart.
// Returned so callers (e.g. completeWorkout's Live Activity post) can tell
// which program day was just finished and, distinctly, whether that
// completion just finished the WHOLE program for the first time.
export interface ProgramProgressResult {
  programName: string;
  dayIndex: number; // 0-based, matches lastCompletedDayIndex
  completedWorkouts: number;
  totalWorkouts?: number;
  justFinishedProgram: boolean;
}

export async function incrementProgramWorkouts(userId: string, dayIndex?: number, programId?: string): Promise<ProgramProgressResult | undefined> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists() || !snap.data()?.activeProgram) return;
  const activeProgram = snap.data()?.activeProgram;
  // If the user switched to a DIFFERENT program between starting and
  // finishing this workout, activeProgram no longer belongs to the program
  // this workout was actually for — writing into it would silently corrupt
  // whichever program happens to be active now instead of the one just
  // trained. Record the completion into that program's OWN saved snapshot
  // instead, so it's never lost, without touching the (unrelated) currently
  // active program at all.
  if (programId && activeProgram?.programId && activeProgram.programId !== programId) {
    const savedProgress = (snap.data()?.programProgress ?? {}) as Record<string, {
      programName?: string; completedWorkouts?: number; totalWorkouts?: number; lastCompletedDayIndex?: number;
    }>;
    const prior = savedProgress[programId];
    const priorLastCompleted = prior?.lastCompletedDayIndex ?? -1;
    if (dayIndex !== undefined && dayIndex <= priorLastCompleted) return; // repeat, not a new day
    const newLastCompleted = dayIndex !== undefined ? dayIndex : priorLastCompleted + 1;
    let completedTraining = newLastCompleted + 1;
    let totalWorkouts = prior?.totalWorkouts ?? 0;
    try {
      const resolved = await resolveProgram(programId);
      if (resolved) {
        const { countTrainingSlotsThrough, getTotalTrainingDays } = await import('./programs');
        completedTraining = countTrainingSlotsThrough(resolved, newLastCompleted);
        totalWorkouts = getTotalTrainingDays(resolved);
      }
    } catch { /* fall back to slot count rather than blocking the workout save */ }
    await updateDoc(doc(db, 'users', userId), {
      [`programProgress.${programId}`]: {
        programName: prior?.programName ?? '',
        completedWorkouts: completedTraining,
        totalWorkouts,
        lastCompletedDayIndex: newLastCompleted,
      },
      lastActive: serverTimestamp(),
    });
    return {
      programName: prior?.programName ?? '',
      dayIndex: newLastCompleted,
      completedWorkouts: completedTraining,
      totalWorkouts,
      justFinishedProgram: totalWorkouts > 0 && (prior?.completedWorkouts ?? 0) < totalWorkouts && completedTraining >= totalWorkouts,
    };
  }

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
  //
  // totalWorkouts (the denominator) gets recomputed here too, not just at
  // enrollment — enrollInProgram only sets it once, so if an admin later
  // edits this program's phases/weeks while someone's already enrolled,
  // their stored denominator went stale and progress% could silently read
  // past 100% or freeze early. Recomputing it fresh on every completion
  // keeps it in sync the same way completedTraining already self-heals.
  let completedTraining = newLastCompleted + 1;
  let totalWorkouts: number | undefined;
  try {
    const resolved = await resolveProgram(activeProgram.programId);
    if (resolved) {
      const { countTrainingSlotsThrough, getTotalTrainingDays } = await import('./programs');
      completedTraining = countTrainingSlotsThrough(resolved, newLastCompleted);
      totalWorkouts = getTotalTrainingDays(resolved);
    }
  } catch { /* fall back to slot count rather than blocking the workout save */ }

  const priorCompletedWorkouts: number = activeProgram?.completedWorkouts ?? 0;
  const resolvedTotalWorkouts = totalWorkouts ?? activeProgram?.totalWorkouts;

  await updateDoc(doc(db, 'users', userId), {
    'activeProgram.completedWorkouts': completedTraining,
    'activeProgram.lastCompletedDayIndex': newLastCompleted,
    ...(totalWorkouts !== undefined ? { 'activeProgram.totalWorkouts': totalWorkouts } : {}),
    lastActive: serverTimestamp(),
  });

  return {
    programName: activeProgram?.programName ?? '',
    dayIndex: newLastCompleted,
    completedWorkouts: completedTraining,
    totalWorkouts: resolvedTotalWorkouts,
    justFinishedProgram: !!resolvedTotalWorkouts && priorCompletedWorkouts < resolvedTotalWorkouts && completedTraining >= resolvedTotalWorkouts,
  };
}

// ---------------------------------------------------------------------------
// Meal history — by date
// ---------------------------------------------------------------------------


/**
 * Explicitly skips a rest slot: moves the active program's pointer onto the
 * rest slot so getNextSession offers the next training day. Does NOT count
 * as a completed workout — completedWorkouts is recomputed from training
 * slots only, exactly as incrementProgramWorkouts does. Repeat-safe: a
 * pointer already at or past `restIndex` is left alone.
 */
export type SkipRestResult =
  | { ok: true }
  | { ok: false; reason: 'not-active' | 'already-past' | 'not-a-rest-day' | 'locked' | 'failed' };

/**
 * Advances the active program's pointer onto a rest slot so the next workout
 * becomes available, without counting a workout.
 *
 * Every failure path used to be a silent `return`, so tapping "Skip rest
 * day" and having nothing happen was indistinguishable from it working. It
 * now reports why, and the callers say so.
 *
 * `completedWorkouts` is recomputed from TRAINING slots only (never
 * `index + 1`), exactly as incrementProgramWorkouts does, so skipping a rest
 * day cannot inflate progress.
 */
export async function skipRestDay(userId: string, programId: string, restIndex: number): Promise<SkipRestResult> {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  const activeProgram = snap.data()?.activeProgram as { programId?: string; lastCompletedDayIndex?: number } | undefined;
  if (!activeProgram || activeProgram.programId !== programId) return { ok: false, reason: 'not-active' };
  const lastCompleted = activeProgram.lastCompletedDayIndex ?? -1;
  // Already skipped (double tap, or two tabs) — treat as success so the UI
  // doesn't show an error for a state that is exactly what was asked for.
  if (restIndex <= lastCompleted) return { ok: true };

  let completedTraining: number | undefined;
  try {
    const resolved = await resolveProgram(programId);
    if (resolved) {
      const { countTrainingSlotsThrough, getProgramDayForDow } = await import('./programs');
      // Refuse to "skip" a training day — this action is only for rest slots.
      const slot = getProgramDayForDow(resolved, restIndex);
      if (slot && !slot.isRest) return { ok: false, reason: 'not-a-rest-day' };
      completedTraining = countTrainingSlotsThrough(resolved, restIndex);
    }
  } catch { /* fall through — the pointer move alone is still correct */ }

  try {
    await updateDoc(ref, {
      'activeProgram.lastCompletedDayIndex': restIndex,
      ...(completedTraining !== undefined ? { 'activeProgram.completedWorkouts': completedTraining } : {}),
      lastActive: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    // firestore.rules' activeProgramWriteAllowed() caps how far a non-member
    // can advance (trialDayLimit). Hitting that is a paywall, not a glitch,
    // and telling someone to "try again" for it is just wrong.
    if ((err as { code?: string })?.code === 'permission-denied') return { ok: false, reason: 'locked' };
    console.error('[skipRestDay] failed:', err);
    return { ok: false, reason: 'failed' };
  }
}

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
  invalidateProgramsCache();
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

// Admin-only writes — 'role' and 'trainerId' are both in the restricted-
// fields list a regular user can't touch on their own doc, but the same
// firestore.rules update rule lets isAdmin() write anything, so these are
// plain client-side writes rather than a server route (unlike
// set-membership, which additionally needs to cancel a Stripe
// subscription — nothing here needs Admin SDK access).
export async function setUserRole(userId: string, role: 'user' | 'trainer' | 'admin') {
  await updateDoc(doc(db, 'users', userId), { role });
}

export async function setUserTrainer(userId: string, trainerId: string | null) {
  await updateDoc(doc(db, 'users', userId), { trainerId });
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

// arrayUnion/arrayRemove (not a getDoc-then-setDoc read-modify-write) —
// atomic set-membership ops, immune to the lost-update race where two
// concurrent calls both read the same array and the second write drops
// whatever the first one added/removed.
export async function hideMockProgram(id: string) {
  await setDoc(doc(db, 'config', 'hiddenMocks'), { ids: arrayUnion(id) }, { merge: true });
}

export async function unhideMockProgram(id: string) {
  await setDoc(doc(db, 'config', 'hiddenMocks'), { ids: arrayRemove(id) }, { merge: true });
}

// ---------------------------------------------------------------------------
// Permanently deleted built-in programs — stored at config/deletedMocks
// { ids: string[] }. Separate from hiddenMocks: a hidden one can still be
// restored, a deleted one is gone from every list for good (short of
// editing Firestore directly) — no restore path is exposed for it.
// ---------------------------------------------------------------------------
export async function getDeletedMockIds(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'config', 'deletedMocks'));
  return snap.exists() ? ((snap.data().ids as string[]) ?? []) : [];
}

export async function permanentlyDeleteMockProgram(id: string) {
  await setDoc(doc(db, 'config', 'deletedMocks'), { ids: arrayUnion(id) }, { merge: true });
}

// ---------------------------------------------------------------------------
// Membership configuration — stored at config/membership
// ---------------------------------------------------------------------------
import type { MembershipConfig, MembershipPlan } from '@/types';

/**
 * Cache for the two membership config documents.
 *
 * Every page wrapped in PaywallGate calls both of these on mount, through
 * useFeatureAccess — and PaywallGate renders NOTHING until they resolve. So
 * each navigation to an AI tool paid two serial Firestore round-trips before a
 * single pixel appeared, on a screen whose whole job is to show an upload
 * button. That is the "clicking analyze food takes ages" delay.
 *
 * These are global config documents: identical for every user, changed only by
 * an admin in the settings panel. Holding the in-flight promise (not just the
 * value) also collapses the duplicate fetches a single page makes when several
 * gated components mount together. saveMembershipConfig/Plans clear it, so an
 * admin's own edit is never served stale to them; the TTL bounds how long
 * anyone else's tab can lag behind a change.
 */
const CONFIG_TTL_MS = 5 * 60 * 1000;
let membershipConfigCache: { at: number; promise: Promise<MembershipConfig | null> } | null = null;
let membershipPlansCache: { at: number; promise: Promise<MembershipPlan[]> } | null = null;

export function clearMembershipCache() {
  membershipConfigCache = null;
  membershipPlansCache = null;
}

export async function getMembershipConfig(): Promise<MembershipConfig | null> {
  if (membershipConfigCache && Date.now() - membershipConfigCache.at < CONFIG_TTL_MS) {
    return membershipConfigCache.promise;
  }
  const promise = (async () => {
    const snap = await getDoc(doc(db, 'config', 'membership'));
    if (!snap.exists()) return null;
    return snap.data() as MembershipConfig;
  })();
  // A failed fetch must not be cached — otherwise one blip locks the whole tab
  // out of its own membership config for the full TTL.
  promise.catch(() => { membershipConfigCache = null; });
  membershipConfigCache = { at: Date.now(), promise };
  return promise;
}

export async function saveMembershipConfig(data: Partial<MembershipConfig>) {
  await setDoc(doc(db, 'config', 'membership'), data, { merge: true });
  clearMembershipCache();
}

// ---------------------------------------------------------------------------
// Exercise category/equipment taxonomy — stored at config/exerciseTaxonomy.
// The admin panel's own MUSCLE_CATEGORIES/EQUIPMENT_OPTIONS constants are
// the default set; this doc only exists once an admin adds or removes a
// value, so a fresh install with no doc yet just falls back to the built-in
// defaults instead of showing an empty picker.
// ---------------------------------------------------------------------------

export interface ExerciseTaxonomy {
  muscleGroups: string[];
  equipment: string[];
}

export async function getExerciseTaxonomy(): Promise<ExerciseTaxonomy | null> {
  const snap = await getDoc(doc(db, 'config', 'exerciseTaxonomy'));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    muscleGroups: (data.muscleGroups as string[]) ?? [],
    equipment: (data.equipment as string[]) ?? [],
  };
}

export async function saveExerciseTaxonomy(taxonomy: ExerciseTaxonomy) {
  await setDoc(doc(db, 'config', 'exerciseTaxonomy'), taxonomy);
}

// ---------------------------------------------------------------------------
// Membership plans — multiple, fully admin-editable pricing tiers, each with
// its own feature access. Stored at config/membershipPlans, same shape as
// coachingPlans but intentionally a separate collection: coaching plans are
// a 1:1 coaching application (manually reviewed), these are instant
// self-serve subscriptions.
// ---------------------------------------------------------------------------
export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  if (membershipPlansCache && Date.now() - membershipPlansCache.at < CONFIG_TTL_MS) {
    return membershipPlansCache.promise;
  }
  const promise = (async () => {
    const snap = await getDoc(doc(db, 'config', 'membershipPlans'));
    return (snap.data()?.plans as MembershipPlan[]) ?? [];
  })();
  promise.catch(() => { membershipPlansCache = null; });
  membershipPlansCache = { at: Date.now(), promise };
  return promise;
}

export async function saveMembershipPlans(plans: MembershipPlan[]): Promise<void> {
  await setDoc(doc(db, 'config', 'membershipPlans'), { plans });
  clearMembershipCache();
}

// ---------------------------------------------------------------------------
// Conversations — staff-initiated only (see firestore.rules' conversations
// create rule: only isAdmin()). A member can reply to an existing thread
// but never create one, and never message another member — there is no
// member-to-member path anywhere in this model (every conversation has
// exactly one adminId and one userId).
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

// Live version of getAdminConversations — a client starting a new "Message
// Support" thread (or sending a follow-up) now shows up in the admin panel
// immediately instead of only after leaving/re-entering the Messages tab
// (loadConversations() was a one-time fetch, only ever called once per tab
// visit since it's gated on conversations.length === 0).
export function subscribeAdminConversations(adminId: string, onUpdate: (convs: Conversation[]) => void): () => void {
  const q = query(collection(db, 'conversations'), where('adminId', '==', adminId));
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
    docs.sort((a, b) => {
      const ta = (a.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      const tb = (b.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      return tb - ta;
    });
    onUpdate(docs);
  }, (err) => console.error('[Firestore] subscribeAdminConversations error:', err));
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

// Live conversation list — same query as getUserConversations(), just kept
// open so a coach/admin reply updates the inbox (unread dot, last-message
// preview) without the user having to leave and come back to this page.
export function subscribeUserConversations(userId: string, onUpdate: (convs: Conversation[]) => void): () => void {
  const q = query(collection(db, 'conversations'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
    docs.sort((a, b) => {
      const ta = (a.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      const tb = (b.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
      return tb - ta;
    });
    onUpdate(docs);
  }, (err) => console.error('[Firestore] subscribeUserConversations error:', err));
}

// Most recent N messages, oldest-first — a support conversation only ever
// needs its recent tail on open, and without a cap a long-running thread
// would download and re-render its *entire* history on every single
// snapshot update. Ordering desc+limit then reversing (rather than
// asc+limit) is what gets you the most recent N instead of the oldest N.
const MESSAGES_PAGE_SIZE = 200;

// Live messages for one open conversation — a coach's reply appears as it's
// sent instead of only showing up after the user reopens the thread.
export function subscribeMessages(convId: string, onUpdate: (messages: Message[]) => void): () => void {
  const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(MESSAGES_PAGE_SIZE));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)).reverse());
  }, (err) => console.error('[Firestore] subscribeMessages error:', err));
}

export async function getMessages(convId: string): Promise<Message[]> {
  try {
    const q = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(MESSAGES_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)).reverse();
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
  // No separate notification doc — the conversation's own unreadByUser/
  // unreadByAdmin flag (surfaced as the dot in the Messages list) is the
  // only "you have a reply" signal. A bell notification duplicated that
  // and leaked the real sender's account name instead of "Support".
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
// Support tickets — member-initiated, unlike conversations above.
//
// The whole lifecycle lives on the ticket doc: 'pending' the moment a member
// opens it, 'ongoing' once staff engage, 'resolved' when it's done. Resolved
// is a real lock, not a label — firestore.rules refuses message creates on a
// resolved ticket, so hiding the composer client-side is a convenience rather
// than the enforcement.
// ---------------------------------------------------------------------------
import type { SupportTicket, SupportTicketStatus } from '@/types';

const SUPPORT_TICKETS_LIMIT = 200;

function sortByLastMessage<T extends { lastMessageAt?: unknown }>(docs: T[]): T[] {
  return docs.sort((a, b) => {
    const ta = (a.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    const tb = (b.lastMessageAt as import('firebase/firestore').Timestamp)?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export interface SupportAttachment {
  url: string;
  name: string;
  type: string;
}

// Firestore rejects a document containing an `undefined` value outright, so
// an absent attachment has to be an omitted key rather than an undefined one.
function attachmentFields(a?: SupportAttachment | null) {
  return a ? { attachmentUrl: a.url, attachmentName: a.name, attachmentType: a.type } : {};
}

/** Opens a ticket and posts its first message in one go. Returns the ticket id. */
export async function createSupportTicket(
  userId: string,
  userDisplayName: string,
  userEmail: string,
  subject: string,
  firstMessage: string,
  attachment?: SupportAttachment | null
): Promise<string> {
  const ref = await addDoc(collection(db, 'supportTickets'), {
    userId,
    userDisplayName,
    userEmail,
    subject,
    status: 'pending' as SupportTicketStatus,
    lastMessage: firstMessage,
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    unreadByUser: false,
    unreadByAdmin: true,
  });
  await addDoc(collection(db, 'supportTickets', ref.id, 'messages'), {
    senderId: userId,
    senderName: userDisplayName,
    content: firstMessage,
    isFromAdmin: false,
    createdAt: serverTimestamp(),
    ...attachmentFields(attachment),
  });
  return ref.id;
}

export function subscribeUserSupportTickets(userId: string, onUpdate: (tickets: SupportTicket[]) => void): () => void {
  const q = query(collection(db, 'supportTickets'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    onUpdate(sortByLastMessage(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket))));
  }, (err) => console.error('[Firestore] subscribeUserSupportTickets error:', err));
}

// Admin-side: every ticket in the system. Capped and sorted client-side for
// the same reason the conversation lists are — it keeps this off a composite
// index that would otherwise have to be deployed before the tab worked at all.
export function subscribeAllSupportTickets(onUpdate: (tickets: SupportTicket[]) => void): () => void {
  const q = query(collection(db, 'supportTickets'), limit(SUPPORT_TICKETS_LIMIT));
  return onSnapshot(q, (snap) => {
    onUpdate(sortByLastMessage(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket))));
  }, (err) => console.error('[Firestore] subscribeAllSupportTickets error:', err));
}

export function subscribeSupportMessages(ticketId: string, onUpdate: (messages: Message[]) => void): () => void {
  const q = query(
    collection(db, 'supportTickets', ticketId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_PAGE_SIZE)
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)).reverse());
  }, (err) => console.error('[Firestore] subscribeSupportMessages error:', err));
}

export async function sendSupportMessage(
  ticketId: string,
  senderId: string,
  senderName: string,
  content: string,
  isFromAdmin: boolean,
  attachment?: SupportAttachment | null
) {
  await addDoc(collection(db, 'supportTickets', ticketId, 'messages'), {
    senderId,
    senderName,
    content,
    isFromAdmin,
    createdAt: serverTimestamp(),
    ...attachmentFields(attachment),
  });
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    // An attachment-only message would otherwise leave the list preview
    // showing the previous message's text, which reads as "nothing happened".
    lastMessage: content || (attachment ? `📎 ${attachment.name}` : ''),
    lastMessageAt: serverTimestamp(),
    // An admin reply moves a brand-new ticket to 'ongoing' on its own, so
    // staff don't have to remember to flip a dropdown to reflect what they
    // just visibly did. An already-resolved ticket can't be replied to at
    // all (rules), so there's no risk of this reopening one by accident.
    ...(isFromAdmin ? { unreadByUser: true, status: 'ongoing' as SupportTicketStatus } : { unreadByAdmin: true }),
  });
}

export async function setSupportTicketStatus(ticketId: string, status: SupportTicketStatus, adminUid: string) {
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    status,
    ...(status === 'resolved'
      ? { resolvedAt: serverTimestamp(), resolvedBy: adminUid }
      : { resolvedAt: null, resolvedBy: null }),
  });
}

export async function deleteSupportTicket(ticketId: string) {
  const msgs = await getDocs(collection(db, 'supportTickets', ticketId, 'messages'));
  await Promise.all(msgs.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'supportTickets', ticketId));
}

export async function markSupportTicketRead(ticketId: string, isAdmin: boolean) {
  await updateDoc(doc(db, 'supportTickets', ticketId), {
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

// Channel list rarely changes, but both the community list page and every
// channel detail page re-fetch it on every visit. Cache the raw (unfiltered)
// docs briefly in memory so hopping list -> channel -> back doesn't refetch
// the whole collection each time, and so the detail page's "does this
// channel exist" check resolves instantly instead of racing the live posts
// listener (which used to flash "Channel not found" for a moment).
let channelsCache: { all: Channel[]; fetchedAt: number } | null = null;
let channelsInFlight: Promise<Channel[]> | null = null;
// Same generation guard as fetchAllPrograms above — an invalidation while a
// read is in flight must not be undone by that read's stale result landing
// afterwards. Especially reachable here: createChannelPost invalidates on
// every single post, which can easily overlap a channel-list load.
let channelsGeneration = 0;
const CHANNELS_CACHE_TTL_MS = 30_000;

async function fetchAllChannels(): Promise<Channel[]> {
  if (channelsCache && Date.now() - channelsCache.fetchedAt < CHANNELS_CACHE_TTL_MS) {
    return channelsCache.all;
  }
  if (channelsInFlight) return channelsInFlight;
  const startedAtGeneration = channelsGeneration;
  channelsInFlight = getDocs(collection(db, 'channels')).then((snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Channel);
    if (startedAtGeneration === channelsGeneration) {
      channelsCache = { all, fetchedAt: Date.now() };
    }
    channelsInFlight = null;
    return all;
  }).catch((err) => { channelsInFlight = null; throw err; });
  return channelsInFlight;
}

export function invalidateChannelsCache() {
  channelsCache = null;
  channelsGeneration++;
}

/**
 * Which tenant's channels a given account should see.
 *
 * An ADMIN manages the whole install and sees every channel — including
 * channels created by a different admin. This matters because an admin
 * promoted by hand (signed up as a normal user, then role flipped to
 * 'admin' in the console) still carries the trainerId their signup
 * assigned, or none at all. The community list used to fall back to
 * `user.uid` for any admin/trainer, so such an account was scoped to a
 * tenant root that owns nothing, and the channel list came back EMPTY —
 * reported live as "the channels don't show at all in community".
 *
 * A TRAINER is scoped to their own uid (they own their channels). A regular
 * user is scoped to the trainer they were assigned at signup. Returning
 * undefined means "no filter" — see getChannels.
 */
export function channelScopeFor(
  role: string | undefined,
  trainerId: string | null | undefined,
  uid: string | undefined,
): string | undefined {
  if (role === 'admin') return undefined;
  if (role === 'trainer') return uid ?? undefined;
  return trainerId ?? undefined;
}

export async function getChannels(trainerId?: string): Promise<Channel[]> {
  const all = await fetchAllChannels();
  return all
    .filter((c) => !trainerId || c.trainerId === trainerId || !c.trainerId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function createChannel(data: Omit<Channel, 'id' | 'postCount' | 'createdAt'>) {
  const clean = Object.fromEntries(Object.entries({ ...data, postCount: 0, createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db, 'channels'), clean);
  invalidateChannelsCache();
  return ref;
}

export async function updateChannel(id: string, data: Partial<Channel>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clean: Record<string, any> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await updateDoc(doc(db, 'channels', id), clean);
  invalidateChannelsCache();
}

export async function deleteChannel(id: string) {
  await deleteDoc(doc(db, 'channels', id));
  invalidateChannelsCache();
}

export async function getChannelPosts(channelId: string): Promise<ChannelPost[]> {
  const snap = await getDocs(
    query(collection(db, 'channels', channelId, 'posts'), orderBy('createdAt', 'desc'), limit(50))
  );
  return snap.docs.map((d) => ({ id: d.id, channelId, ...d.data() }) as ChannelPost).reverse();
}

// Live version of getChannelPosts — a user sitting in a channel while
// someone else posts previously never saw the new message until they
// navigated away and back (the page only fetched once on mount), which
// reads as broken chat rather than a static community wall. Mirrors the
// same query/ordering as the one-shot version above.
export function subscribeChannelPosts(
  channelId: string,
  onUpdate: (posts: ChannelPost[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(collection(db, 'channels', channelId, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, channelId, ...d.data() }) as ChannelPost).reverse());
    },
    (err) => onError?.(err),
  );
}

export async function createChannelPost(channelId: string, data: {
  userId: string; userDisplayName: string; userPhotoURL?: string; userIsAdmin?: boolean;
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
  // Bump post count on the channel — best-effort ONLY. firestore.rules
  // allows updating a channel doc solely for isAdmin(), so for every
  // regular member this throws permission-denied AFTER their post has
  // already been created successfully. Left unguarded, that rejection
  // propagated all the way out to the caller's catch, which showed
  // "Failed to post" and never cleared the compose box — so members saw
  // an error on every single post (and re-sent, double-posting), even
  // though the post itself went through fine and appeared in the feed.
  // The count is cosmetic; the post is what matters.
  await updateDoc(doc(db, 'channels', channelId), { postCount: increment(1) }).catch(() => {});
  invalidateChannelsCache();
  // Track last post time for slow mode. Also best-effort: it must not be
  // able to fail the post either — but note that if this DOES fail, slow
  // mode silently stops applying to that member, since the timestamp it
  // reads back is never written.
  await setDoc(doc(db, 'channels', channelId, 'members', data.userId), { lastPostAt: serverTimestamp() }, { merge: true }).catch(() => {});
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
  userId: string; userDisplayName: string; userPhotoURL?: string; userIsAdmin?: boolean; content: string;
  /** Set to thread this under another reply instead of the post itself. */
  parentReplyId?: string;
}) {
  const { parentReplyId, ...rest } = data;
  await addDoc(collection(db, 'channels', channelId, 'posts', postId, 'replies'), {
    ...rest, channelId, likes: [], replyCount: 0, replyTo: postId,
    // Stored flat in the same subcollection and grouped client-side, so a
    // whole thread is still one read no matter how deep it looks.
    ...(parentReplyId ? { parentReplyId } : {}),
    createdAt: serverTimestamp(),
  });
  // Best-effort for the same reason as createChannelPost's postCount:
  // firestore.rules only allows updating a post you own (or a likes-only
  // diff), so bumping replyCount on SOMEONE ELSE's post throws — which
  // meant replying to another member's post always surfaced "Failed to
  // reply" and left the reply box open, even though the reply itself was
  // saved. Replying to your own post happened to work, which is why this
  // survived: it only breaks for the case that actually matters.
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { replyCount: increment(1) }).catch(() => {});
}

export async function deleteChannelPost(channelId: string, postId: string) {
  await deleteDoc(doc(db, 'channels', channelId, 'posts', postId));
  await updateDoc(doc(db, 'channels', channelId), { postCount: increment(-1) }).catch(() => {});
  invalidateChannelsCache();
}

export async function pinChannelPost(channelId: string, postId: string) {
  await updateDoc(doc(db, 'channels', channelId), { pinnedPostId: postId });
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { pinned: true });
  invalidateChannelsCache();
}

export async function unpinChannelPost(channelId: string, postId: string) {
  await updateDoc(doc(db, 'channels', channelId), { pinnedPostId: deleteField() });
  await updateDoc(doc(db, 'channels', channelId, 'posts', postId), { pinned: false });
  invalidateChannelsCache();
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
    streak: (data.streak as number) ?? 0,
    totalWorkouts: (data.totalWorkouts as number) ?? 0,
    totalWeightLifted: (data.totalWeightLifted as number) ?? 0,
    questsCompleted: (data.questsCompleted as string[]) ?? [],
  };
}

// Public, field-limited mirror of the private `users/{uid}` doc — see
// firestore.rules. `users/{uid}` is readable only by its owner and
// admin/own-trainer, so anything shown to OTHER users (leaderboard, today's
// workout count) must be read from here instead. Never mirror `banned` from
// client code — only the server-side ban-user route (firebase-admin, bypasses
// rules) is allowed to set it, so a banned user can't self-unban by writing
// to their own doc.
export async function syncLeaderboardPublic(userId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(doc(db, 'leaderboardPublic', userId), patch, { merge: true });
  } catch (err) {
    console.error('[Firestore] syncLeaderboardPublic failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Community Live Activity — a deliberately minimal, PUBLIC feed of meaningful
// training events across the whole community ("what's happening right now",
// distinct from the Leaderboard's "who's ranked where"). Same pattern as
// leaderboardPublic above: a separate, field-limited collection rather than
// exposing anything from the private `events` collection (whose payloads
// hold exactly the granular stuff — duration, calories, meal contents —
// this must never show). Never write anything beyond ActivityType/label/
// displayName/createdAt; no raw stats, no timestamps-of-day, no numbers
// beyond what the label itself needs (e.g. a PR's weight).
// ---------------------------------------------------------------------------
export type CommunityActivityType = 'workout' | 'program_day' | 'program_completed' | 'pr' | 'achievement' | 'quest' | 'streak';

export interface CommunityActivity {
  id: string;
  userId: string;
  displayName: string;
  type: CommunityActivityType;
  label: string;
  createdAt: unknown;
}

export async function postCommunityActivity(
  userId: string,
  displayName: string,
  type: CommunityActivityType,
  label: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'communityActivity'), {
      userId, displayName, type, label, createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Best-effort — a failed activity post should never block the
    // workout/achievement/etc. write that triggered it.
    console.error('[Firestore] postCommunityActivity failed:', err);
  }
}

export function subscribeCommunityActivity(onUpdate: (items: CommunityActivity[]) => void, limitCount = 30): () => void {
  const q = query(collection(db, 'communityActivity'), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityActivity)));
  }, (err) => console.error('[Firestore] subscribeCommunityActivity error:', err));
}

// NOTE: This app is currently single-tenant (one trainer per install), so the
// leaderboard intentionally shows every user rather than filtering by
// trainerId — that filter was fragile (any mismatch between a user's stored
// trainerId and the live admin uid made them silently invisible) and adds no
// value with only one trainer. Revisit if true multi-tenant coaching ships.
/**
 * The caller's rank, computed as a server-side COUNT of everyone above
 * them — no documents are transferred at all.
 *
 * The dashboard previously got this by downloading the top 200
 * leaderboardPublic docs and calling indexOf on them: hundreds of KB over
 * the wire on every dashboard load to render a single number, and it
 * couldn't rank anyone outside the top 200 anyway (they just got null).
 * A count aggregate is both far cheaper and strictly more correct.
 */
export async function getMyLeaderboardRank(xp: number): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, 'leaderboardPublic'), where('xp', '>', xp))
  );
  return snap.data().count + 1;
}

export async function getLeaderboard(limitCount = 10): Promise<LeaderboardEntry[]> {
  const snap = await getDocs(query(collection(db, 'leaderboardPublic'), orderBy('xp', 'desc'), limit(200)));
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
  const q = query(collection(db, 'leaderboardPublic'), orderBy('xp', 'desc'), limit(200));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs
      .filter((d) => !d.data().banned)
      .map((d) => mapToLeaderboardEntry(d.id, d.data()))
      .filter((e) => e.totalWorkouts > 0);
    onUpdate(entries.sort((a, b) => b.xp - a.xp).slice(0, limitCount));
  }, (err) => console.error('[Firestore] subscribeLeaderboard error:', err));
}

// "Near You" — a global top-10 is dominated by outliers a typical user can
// never realistically catch, which motivates less than seeing people at a
// similar level. Reuses the same broad 200-user snapshot as the global
// board (no new query/index) and buckets it around the caller's own power
// level instead, widening the band if too few peers fall inside it so the
// list never comes back emptier than the caller can see makes sense.
export function subscribeNearbyLeaderboard(
  myPowerLevel: number,
  onUpdate: (entries: LeaderboardEntry[]) => void,
  limitCount = 10,
): () => void {
  const q = query(collection(db, 'leaderboardPublic'), orderBy('xp', 'desc'), limit(200));
  return onSnapshot(q, (snap) => {
    const all = snap.docs
      .filter((d) => !d.data().banned)
      .map((d) => mapToLeaderboardEntry(d.id, d.data()))
      .filter((e) => e.totalWorkouts > 0);

    let band = 10;
    let nearby: LeaderboardEntry[] = [];
    while (band <= 1000) {
      nearby = all.filter((e) => Math.abs(e.powerLevel - myPowerLevel) <= band);
      if (nearby.length >= limitCount || band >= 1000) break;
      band *= 2;
    }
    // Closest power level first, not highest XP — "near you" means
    // proximity, the global board already covers the XP-ranked view.
    nearby.sort((a, b) => Math.abs(a.powerLevel - myPowerLevel) - Math.abs(b.powerLevel - myPowerLevel));
    onUpdate(nearby.slice(0, limitCount));
  }, (err) => console.error('[Firestore] subscribeNearbyLeaderboard error:', err));
}

// Live "N people trained today" count for the dashboard's ambient social-proof
// ticker. Uses statsCache.lastWorkoutDate (date-only — the finest-grained
// workout timestamp readable client-side; the `events` collection that has
// real per-workout timestamps is locked to each user's own events by rule)
// rather than faking hour-level precision the data doesn't actually have.
/**
 * "N people trained today". Keeps the same subscribe-shaped signature the
 * dashboard already uses, but is no longer a live listener over 300
 * documents.
 *
 * It used to onSnapshot the 300 most recent leaderboardPublic docs and
 * count matches client-side — so every dashboard held a live subscription
 * that re-delivered all 300 docs whenever ANY user's XP changed, purely to
 * display one number. Now it's a server-side count aggregate (no documents
 * transferred), refreshed on an interval instead of streamed. A community
 * counter being up to a minute stale is unnoticeable; the bandwidth wasn't.
 */
export function subscribeTodayWorkoutCount(onUpdate: (count: number) => void): () => void {
  const todayStr = new Date().toLocaleDateString('sv-SE');
  let cancelled = false;
  const load = () => {
    getCountFromServer(
      query(collection(db, 'leaderboardPublic'), where('lastWorkoutDate', '==', todayStr))
    )
      .then((snap) => { if (!cancelled) onUpdate(snap.data().count); })
      .catch((err) => console.error('[Firestore] subscribeTodayWorkoutCount error:', err));
  };
  load();
  const interval = setInterval(load, 60_000);
  return () => { cancelled = true; clearInterval(interval); };
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
  post?: { userId: string; exerciseName: string; displayName?: string; weightKg?: number },
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

  // Only an admin-approved PR counts as a real, verified event worth
  // surfacing community-wide — a pending/rejected submission is unverified
  // and shouldn't imply "this actually happened" to everyone else.
  if (post && status === 'approved') {
    const weightPhrase = post.weightKg ? ` — ${post.weightKg}kg` : '';
    postCommunityActivity(post.userId, post.displayName || 'A member', 'pr', `hit a new PR: ${post.exerciseName}${weightPhrase}`).catch(() => {});
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
  // Health screening / lifestyle habits, moved here from signup onboarding.
  // Optional — the applicant answers what they're comfortable sharing.
  medicalHistory?: Record<string, unknown>;
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

  // Notify the admin so they know to review it. A regular user can't run a
  // `where('role','==','admin')` query against /users — Firestore rejects
  // the whole query since it can't prove every possible matching doc is
  // readable by this caller, even though the notification create rule
  // itself would allow it. That used to throw here, AFTER the application
  // doc above had already been saved — so the user saw "Failed to submit"
  // on an application that actually went through. This is a single-tenant
  // install (one admin), so instead of listing /users, notify the admin id
  // already public on system/config — same source messages/page.tsx's
  // fallback resolves to, and no extra read permissions needed.
  try {
    const cfg = await getSystemConfig();
    const adminId = (cfg?.trainerId as string) || (cfg?.adminUid as string) || null;
    if (adminId) {
      await sendNotification({
        userId: adminId,
        title: 'New 1:1 Coaching Application',
        body: `${data.userName} applied for "${data.planName}". Review it in Admin → Coaching Apps.`,
        type: 'manual',
        actionLabel: 'Review Application',
        actionUrl: '/admin?tab=coaching',
      });
    }
  } catch (err) {
    console.error('[Firestore] Failed to notify admin of new coaching application:', err);
  }

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

// Removes the application outright. Note this genuinely frees the applicant
// to apply again — submitCoachingApplication() blocks a second submission by
// looking for an existing doc (see getUserCoachingApplication above), so
// deleting a rejected application is also how you let someone re-apply
// without waiting. No notification is sent: to the applicant this is a
// record being cleared, not a decision being made.
export async function deleteCoachingApplication(appId: string): Promise<void> {
  await deleteDoc(doc(db, 'coachingApplications', appId));
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
    sub = ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${ml} ml`;
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
