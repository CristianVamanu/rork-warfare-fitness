import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _db: Firestore | null = null;

/**
 * Returns the initialized Firebase Admin App, or null if env vars are missing.
 * Safe to call multiple times — initializes only once per process.
 */
export function getAdminApp(): App | null {
  if (_app) return _app;

  // If already initialized by another module in the same process, reuse it
  if (getApps().length > 0) {
    _app = getApp();
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      '[firebase-admin] Missing env vars. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
    return null;
  }

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  try {
    _app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      ...(storageBucket ? { storageBucket } : {}),
    });
  } catch (err) {
    console.error('[firebase-admin] initializeApp failed:', err);
    return null;
  }
  return _app;
}

/**
 * Returns a Firestore instance forced onto REST transport instead of the
 * default gRPC transport. firebase-admin's gRPC client relies on native
 * (.node) bindings that are a well-known source of servers crashing outside
 * any catchable JS exception on serverless platforms like Vercel — the
 * process dies before a try/catch ever runs, so the client sees a raw
 * platform error page instead of a JSON error response. preferRest avoids
 * loading that native binding path entirely. Must be set before any other
 * Firestore call on this instance, so this is the only place that should
 * ever call getFirestore(app) for admin routes — everywhere else should
 * import this function instead.
 */
export function getAdminDb(app: App): Firestore {
  if (_db) return _db;
  _db = getFirestore(app);
  try {
    _db.settings({ preferRest: true });
  } catch (err) {
    // settings() throws if any Firestore call already happened on this
    // instance — non-fatal, just means another module beat us to it.
    console.warn('[firebase-admin] Firestore settings() skipped:', err instanceof Error ? err.message : err);
  }
  return _db;
}
