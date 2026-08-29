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
export async function checkAndIncrementUsage(
  app: App,
  uid: string,
  feature: string,
  dailyLimit: number,
  today: string
): Promise<{ allowed: boolean; remaining: number }> {
  const db = getAdminDb(app);
  const ref = db.collection('users').doc(uid).collection('usage').doc(`${feature}_${today}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data()?.count as number ?? 0) : 0;

    if (count >= dailyLimit) {
      return { allowed: false, remaining: 0 };
    }

    tx.set(ref, { count: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
    return { allowed: true, remaining: dailyLimit - count - 1 };
  });
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
}
