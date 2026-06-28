import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';

let _app: App | null = null;

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

  _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return _app;
}
