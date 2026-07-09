import { getAdminDb } from './firebase-admin';
import type { App } from 'firebase-admin/app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
  dailyLimit: number
): Promise<{ allowed: boolean; remaining: number }> {
  const db = getAdminDb(app);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
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
