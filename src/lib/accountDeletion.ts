import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { getStripe } from '@/lib/stripe';

/**
 * Collections that store docs keyed by `userId` (not by uid-as-doc-id) —
 * every one of these needs an explicit query + batch delete, since
 * Firestore has no cascade-delete of its own.
 */
const USER_FIELD_COLLECTIONS = [
  'events',
  'meals',        // legacy, pre-events-migration
  'waterLogs',    // legacy
  'workoutLogs',  // legacy
  'weightLogs',
  'prPosts',
  'progressPhotos',
  'notifications',
  'coachingApplications',
  // All of the below were previously missed, leaving a "deleted" account's
  // data behind — most visibly communityActivity, which is publicly
  // readable and kept the ex-user's displayName in the Live Activity feed.
  'communityActivity',
  'goals',
  'ptTestResults',
  // Keyed `${uid}_${date}` but also carries a userId field, so the same
  // query path works — no doc-id range scan needed.
  'habitLogs',
] as const;

/** Docs keyed directly by uid — a straight doc().delete(), no query needed. */
const USER_ID_DOC_COLLECTIONS = [
  'users',
  'userPreferences',
  // The public leaderboard mirror — holds displayName/xp/streak. Without
  // this, a deleted user stayed listed by name on the public leaderboard
  // (including the logged-out landing page) indefinitely.
  'leaderboardPublic',
  // Any in-flight 2FA code for this account.
  'twoFactorCodes',
] as const;

async function deleteByQuery(db: Firestore, collection: string, field: string, uid: string) {
  const snap = await db.collection(collection).where(field, '==', uid).get();
  if (snap.empty) return 0;
  const batches: Promise<unknown>[] = [];
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      batches.push(batch.commit());
      batch = db.batch();
    }
  }
  batches.push(batch.commit());
  await Promise.all(batches);
  return snap.size;
}

/** Best-effort — a missing/inaccessible bucket path shouldn't block the rest of deletion. */
async function deleteStorageFolder(app: App, prefix: string) {
  try {
    const bucket = getStorage(app).bucket();
    await bucket.deleteFiles({ prefix });
  } catch (err) {
    console.error(`[accountDeletion] Storage cleanup failed for prefix "${prefix}":`, err);
  }
}

export interface DeletionSummary {
  firestoreDocsDeleted: number;
  authAccountDeleted: boolean;
  storageCleaned: boolean;
}

/**
 * Full account teardown — Firestore data across every collection that
 * references this user, their Auth account, and their Storage files.
 * Used by both the admin "remove client" action and self-service account
 * deletion, so a removed user is actually gone, not just hidden from the
 * client list while every workout, meal, PR post, and progress photo they
 * ever logged sits around orphaned in the database indefinitely.
 */
export async function deleteUserCompletely(app: App, db: Firestore, uid: string): Promise<DeletionSummary> {
  let firestoreDocsDeleted = 0;

  // Cancel every live Stripe subscription BEFORE wiping the user doc — once
  // deleted, the app has no record of any stripeSubscriptionId and no way
  // to stop future billing, so a self-deleted (or admin-removed) user would
  // otherwise keep getting charged indefinitely with no account left to
  // dispute it from. membership and coaching are separate subscriptions —
  // a user can hold both at once — so both need to be cancelled, not just
  // whichever one happens to be checked.
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const membershipSubId = userSnap.data()?.membership?.stripeSubscriptionId as string | undefined;
    const coachingSubId = userSnap.data()?.coaching?.stripeSubscriptionId as string | undefined;
    const subIds = Array.from(new Set([membershipSubId, coachingSubId].filter((id): id is string => !!id)));
    if (subIds.length > 0) {
      const stripe = await getStripe();
      for (const subId of subIds) {
        await stripe.subscriptions.cancel(subId);
        console.log(`[accountDeletion] Cancelled Stripe subscription ${subId} for user ${uid}`);
      }
    }
  } catch (err) {
    // Non-fatal but logged loudly — an already-cancelled/missing subscription
    // is fine, but any other failure here needs a human to check Stripe
    // directly since deletion is about to make it much harder to trace.
    console.error(`[accountDeletion] Stripe subscription cancellation failed for ${uid}:`, err);
  }

  for (const collection of USER_FIELD_COLLECTIONS) {
    firestoreDocsDeleted += await deleteByQuery(db, collection, 'userId', uid);
  }

  // conversations use adminId/userId, not a single `userId` field
  const convSnap = await db.collection('conversations').where('userId', '==', uid).get();
  for (const conv of convSnap.docs) {
    const messagesSnap = await conv.ref.collection('messages').get();
    const batch = db.batch();
    messagesSnap.docs.forEach((m) => batch.delete(m.ref));
    batch.delete(conv.ref);
    await batch.commit();
    firestoreDocsDeleted += messagesSnap.size + 1;
  }

  for (const collection of USER_ID_DOC_COLLECTIONS) {
    const ref = db.collection(collection).doc(uid);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      firestoreDocsDeleted++;
    }
  }

  // Subcollections Firestore never cascade-deletes on its own, even once
  // the parent doc is gone:
  //  - pushSubscriptions/{uid}/devices/{deviceId} (one doc per device)
  //  - trustedDevices/{uid}/devices/{deviceId}    (2FA "remember this device")
  //  - users/{uid}/usage/{feature}_{date}         (daily AI/scan usage counters)
  for (const [parent, sub] of [
    ['pushSubscriptions', 'devices'],
    ['trustedDevices', 'devices'],
    ['users', 'usage'],
  ] as const) {
    const subSnap = await db.collection(parent).doc(uid).collection(sub).get();
    if (subSnap.empty) continue;
    const batch = db.batch();
    subSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    firestoreDocsDeleted += subSnap.size;
  }

  await deleteStorageFolder(app, `users/${uid}/`);
  await deleteStorageFolder(app, `progressPhotos/${uid}/`);
  await deleteStorageFolder(app, `prPosts/${uid}/`);

  let authAccountDeleted = false;
  try {
    await getAuth(app).deleteUser(uid);
    authAccountDeleted = true;
  } catch (err) {
    // e.g. user already deleted from Auth previously — non-fatal, Firestore
    // cleanup above already happened and is the part that actually matters.
    console.error(`[accountDeletion] Auth deletion failed for ${uid}:`, err);
  }

  return { firestoreDocsDeleted, authAccountDeleted, storageCleaned: true };
}

/** Everything the app holds about a user, for self-service export (GDPR data portability). */
export async function exportUserData(db: Firestore, uid: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  const userSnap = await db.collection('users').doc(uid).get();
  result.profile = userSnap.exists ? userSnap.data() : null;

  for (const collection of USER_FIELD_COLLECTIONS) {
    const snap = await db.collection(collection).where('userId', '==', uid).get();
    result[collection] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const prefsSnap = await db.collection('userPreferences').doc(uid).get();
  result.preferences = prefsSnap.exists ? prefsSnap.data() : null;

  return result;
}
