import { getAdminDb } from './firebase-admin';
import type { App } from 'firebase-admin/app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';

// Every other "today" boundary in this app (dashboard streaks, workout
// day-gating, meal/water logs) is computed client-side via
// toLocaleDateString('sv-SE'), i.e. the USER's local date. These usage caps
// ran entirely server-side with new Date().toISOString() — the SERVER's
// UTC date — so a user's "20 scans left today" could reset in the middle
// of their afternoon or persist for hours past their own midnight,
// depending how far their timezone sits from UTC. Callers now read the
// user's local date from this header (set client-side alongside the
// request) instead, falling back to UTC only when it's genuinely absent
// (e.g. a future non-browser caller).
export function resolveLocalDate(req: NextRequest): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  const header = req.headers.get('x-local-date');
  if (!header || !/^\d{4}-\d{2}-\d{2}$/.test(header)) return serverToday;

  // Format-valid alone isn't enough — a client could send any arbitrary
  // date to reset its own daily counter early. A real local date can only
  // ever differ from the server's UTC date by one day in either direction
  // (timezone offset), so clamp anything further out back to server-today.
  const diffMs = new Date(`${header}T00:00:00Z`).getTime() - new Date(`${serverToday}T00:00:00Z`).getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (Number.isNaN(diffDays) || Math.abs(diffDays) > 1) return serverToday;
  return header;
}

/**
 * Enforces a daily-count cap per user per feature (barcode scans, AI food
 * photo analysis, etc.) so a single account can't hammer paid third-party
 * APIs (OpenAI, OpenFoodFacts) or run up usage costs. Counts live at
 * users/{uid}/usage/{feature}_{YYYY-MM-DD}, one doc per user per day per
 * feature, reset automatically each day just by the date changing — no
 * cron/cleanup needed, though the docs do accumulate (acceptable at this
 * scale; Firestore TTL policies could prune old ones later if needed).
 */
/**
 * Org-wide AI budget.
 *
 * Per-user daily caps bound what any ONE person can spend, but nothing
 * bounded the total. At a few hundred users that is theoretical; at a few
 * thousand it is the only place in this app where a bad day costs real
 * money, and the first you would hear of it is the OpenAI bill (or, with
 * auto-reload off, every AI feature abruptly failing with a raw error once
 * the balance hits zero).
 *
 * This counts every metered AI call across all users for the server's UTC
 * day and refuses new ones past the configured ceiling — so the failure
 * mode becomes a clear, deliberate "daily budget reached" message that you
 * set, rather than an outage you discover.
 *
 * Deliberately the SERVER's date, not the caller's local one: a global
 * budget has to be a single window for everyone, or users in later
 * timezones would roll the counter over early for everybody.
 *
 * Disabled by default — `aiOrgDailyLimit` unset or 0 means no ceiling, and
 * this costs one extra read per AI call and nothing else.
 */
export const ORG_USAGE_DOC = 'aiUsage';

/**
 * Shown when the ORG budget is what blocked the call, so the user isn't told
 * they personally hit a limit they didn't. Worded as a deliberate pause
 * rather than an error, because that is what it is.
 */
export const ORG_BUDGET_MSG =
  "AI features are paused for today — the app-wide daily budget has been reached. They'll be back tomorrow.";

export function orgUsageDocId(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The org counter is SHARDED across this many documents per day.
 *
 * It used to be a single document, written inside a transaction by every AI
 * call in the app. Firestore sustains roughly one write per second to any one
 * document; past that, contending transactions retry and then fail outright.
 * At a few users that is invisible, but it is the first thing in this codebase
 * that breaks purely from success — a burst of AI usage would start returning
 * 500s from features that are otherwise working perfectly.
 *
 * Ten shards move the ceiling to ~10 writes/second. Each call picks one at
 * random, so contention is spread; the total is the sum, read only by the
 * admin dashboard and by the limit check itself.
 */
const ORG_SHARDS = 10;
const orgShardId = (date: string, shard: number) => `${date}_${shard}`;

/** Sums today's shards (plus the pre-sharding document, so history isn't lost). */
async function readOrgUsage(
  db: FirebaseFirestore.Firestore,
  date: string,
): Promise<{ count: number; byFeature: Record<string, number> }> {
  const refs = [
    db.collection(ORG_USAGE_DOC).doc(date), // legacy single doc
    ...Array.from({ length: ORG_SHARDS }, (_, i) => db.collection(ORG_USAGE_DOC).doc(orgShardId(date, i))),
  ];
  const snaps = await db.getAll(...refs);
  let count = 0;
  const byFeature: Record<string, number> = {};
  for (const snap of snaps) {
    const data = snap.data();
    if (!data) continue;
    count += (data.count as number) ?? 0;
    for (const [feature, n] of Object.entries((data.byFeature as Record<string, number>) ?? {})) {
      byFeature[feature] = (byFeature[feature] ?? 0) + n;
    }
  }
  return { count, byFeature };
}

export interface UsageResult {
  allowed: boolean;
  remaining: number;
  /** Set when the ORG budget blocked this, not the caller's own limit. */
  orgLimitReached?: boolean;
}

export async function checkAndIncrementUsage(
  app: App,
  uid: string,
  feature: string,
  dailyLimit: number,
  today: string
): Promise<UsageResult> {
  const db = getAdminDb(app);
  const ref = db.collection('users').doc(uid).collection('usage').doc(`${feature}_${today}`);
  const configRef = db.collection('system').doc('config');
  const date = orgUsageDocId();

  // The org ceiling is checked OUTSIDE the per-user transaction, against the
  // summed shards. Reading it inside meant every AI call in the app
  // transacted on one shared document; see ORG_SHARDS. The tiny race this
  // opens — two calls passing the check at the same instant when the budget
  // has one slot left — overshoots a soft daily spend cap by one call, which
  // is not worth serialising every AI request in the product to prevent.
  const cfgSnap = await configRef.get();
  const orgLimit = Number(cfgSnap.data()?.aiOrgDailyLimit ?? 0);
  if (orgLimit > 0) {
    const { count } = await readOrgUsage(db, date);
    if (count >= orgLimit) {
      return { allowed: false, remaining: 0, orgLimitReached: true };
    }
  }

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data()?.count as number ?? 0) : 0;
    if (count >= dailyLimit) {
      return { allowed: false, remaining: 0 };
    }
    tx.set(ref, { count: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
    return { allowed: true, remaining: dailyLimit - count - 1 };
  });

  if (result.allowed) {
    // Tracked even when no ceiling is configured, so the admin dashboard can
    // show real usage before anyone decides what the ceiling should be.
    // A NESTED map, not a dotted key: set({merge}) treats "byFeature.x" as a
    // literal field name (only update() parses paths), so the admin panel's
    // per-feature breakdown read an always-empty `byFeature` map while the
    // counts piled up in top-level fields nobody looked at.
    const shard = Math.floor(Math.random() * ORG_SHARDS);
    await db.collection(ORG_USAGE_DOC).doc(orgShardId(date, shard)).set({
      count: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
      byFeature: { [feature]: FieldValue.increment(1) },
    }, { merge: true }).catch((err) => {
      // Usage accounting must never fail a call the user is entitled to make.
      console.error('[usageLimit] org shard write failed:', err);
    });
  }

  return result;
}

/** Today's org-wide AI usage and the configured ceiling, for the admin panel. */
export async function getOrgAiUsage(app: App): Promise<{
  used: number; limit: number; byFeature: Record<string, number>; date: string;
}> {
  const db = getAdminDb(app);
  const date = orgUsageDocId();
  const [usage, cfgSnap] = await Promise.all([
    readOrgUsage(db, date),
    db.collection('system').doc('config').get(),
  ]);
  return {
    used: usage.count,
    limit: Number(cfgSnap.data()?.aiOrgDailyLimit ?? 0),
    byFeature: usage.byFeature,
    date,
  };
}

// Read-only lookup for showing "X left today" in the UI before the user
// takes an action — a plain get(), not a transaction, since there's
// nothing to race against for a read.
export async function getRemainingUsage(app: App, uid: string, feature: string, dailyLimit: number, today: string): Promise<number> {
  const db = getAdminDb(app);
  const snap = await db.collection('users').doc(uid).collection('usage').doc(`${feature}_${today}`).get();
  const count = snap.exists ? (snap.data()?.count as number ?? 0) : 0;
  return Math.max(0, dailyLimit - count);
}

// Shared lookup for a per-feature daily cap stored on system/config, with a
// fallback default — the same admin-configurable field two routes
// (analyze-food, barcode) each need to read both to enforce the limit AND
// to answer "how many are left today" from a separate GET, so it lives
// here rather than duplicated (or exported from a route.ts file, which
// Next.js's App Router rejects for anything but its recognized handler
// exports).
export async function resolveConfiguredDailyLimit(app: App, configField: string, fallback: number): Promise<number> {
  const cfgSnap = await getAdminDb(app).collection('system').doc('config').get();
  return (cfgSnap.data()?.[configField] as number) || fallback;
}

// checkAndIncrementUsage reserves the day's slot up front (needed to stay
// race-safe under concurrent requests), so a call that fails AFTER that —
// the third-party API errored, or its response was unusable — would
// otherwise burn one of the user's limited daily attempts for nothing.
// Call this from the caller's catch/failure paths to give it back.
export async function refundUsage(app: App, uid: string, feature: string, today: string): Promise<void> {
  const db = getAdminDb(app);
  const ref = db.collection('users').doc(uid).collection('usage').doc(`${feature}_${today}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data()?.count as number ?? 0) : 0;
    if (count > 0) tx.update(ref, { count: FieldValue.increment(-1) });
  });

  // The org budget is refunded on the same failures as the per-user one — a
  // provider error shouldn't eat the shared allowance either. Sharded and
  // outside the transaction for the same reason the increment is (see
  // ORG_SHARDS); a decrement can safely land on a different shard than the
  // increment did, because only the sum is ever read.
  const date = orgUsageDocId();
  const shard = Math.floor(Math.random() * ORG_SHARDS);
  await db.collection(ORG_USAGE_DOC).doc(orgShardId(date, shard)).set({
    count: FieldValue.increment(-1),
    byFeature: { [feature]: FieldValue.increment(-1) },
  }, { merge: true }).catch((err) => {
    console.error('[usageLimit] org shard refund failed:', err);
  });
}
