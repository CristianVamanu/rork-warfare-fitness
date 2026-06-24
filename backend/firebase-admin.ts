import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set');

  const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  _app = initializeApp({ credential: cert(serviceAccount) });
  return _app;
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return getAuth(getAdminApp()).verifyIdToken(token);
}

/** Admin status is determined solely by Firebase custom claims — set via scripts/set-admin.ts */
export function isAdminFromClaims(decoded: DecodedIdToken): boolean {
  return decoded.admin === true;
}
