import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase-admin';

export type LimitKind = 'barcodeScans' | 'foodScans';

const DAILY_LIMITS: Record<LimitKind, number> = {
  barcodeScans: 50,
  foodScans: 50,
};

/**
 * Atomically checks and increments a per-user daily usage counter.
 * Resets automatically when the stored date differs from today.
 * Returns { ok: false } without incrementing if the daily limit is already hit.
 */
export async function checkAndIncrementDailyLimit(
  uid: string,
  kind: LimitKind
): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit = DAILY_LIMITS[kind];
  const app = getAdminApp();
  if (!app) return { ok: true, remaining: limit, limit }; // fail open if Admin SDK unavailable

  const db = getFirestore(app);
  const today = new Date().toLocaleDateString('sv-SE');
  const ref = db.collection('usageLimits').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const isNewDay = data?.date !== today;
    const currentCount = isNewDay ? 0 : (data?.[kind] ?? 0);

    if (currentCount >= limit) {
      return { ok: false, remaining: 0, limit };
    }

    if (isNewDay) {
      tx.set(ref, { date: today, barcodeScans: 0, foodScans: 0, [kind]: 1 }, { merge: true });
    } else {
      tx.set(ref, { [kind]: FieldValue.increment(1) }, { merge: true });
    }

    return { ok: true, remaining: limit - currentCount - 1, limit };
  });
}
