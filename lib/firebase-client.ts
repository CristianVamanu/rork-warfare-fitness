/**
 * Firebase client singleton — single source of truth.
 * Initialized ONLY from NEXT_PUBLIC_FIREBASE_* environment variables.
 * All initialization is lazy — nothing runs at module import time.
 */
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const REQUIRED_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

function readEnv() {
  return {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getMissingVars(): string[] {
  const env = readEnv();
  const keyMap: Record<string, string | undefined> = {
    NEXT_PUBLIC_FIREBASE_API_KEY:   env.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: env.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: env.projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID:    env.appId,
  };
  return REQUIRED_KEYS.filter(k => !keyMap[k]);
}

export function isFirebaseConfigured(): boolean {
  return getMissingVars().length === 0;
}

/** Logs env var presence to the browser/server console at runtime. Call once after app mounts. */
export function logFirebaseDiagnostic(): void {
  const env = readEnv();
  console.log('[Firebase] Runtime ENV diagnostic:');
  console.log('  NEXT_PUBLIC_FIREBASE_API_KEY            =', env.apiKey            ? '✓ set' : '✗ MISSING');
  console.log('  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        =', env.authDomain        ? '✓ set' : '✗ MISSING');
  console.log('  NEXT_PUBLIC_FIREBASE_PROJECT_ID         =', env.projectId         ? '✓ set' : '✗ MISSING');
  console.log('  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     =', env.storageBucket     ? '✓ set' : '✗ MISSING (optional)');
  console.log('  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=', env.messagingSenderId ? '✓ set' : '✗ MISSING (optional)');
  console.log('  NEXT_PUBLIC_FIREBASE_APP_ID             =', env.appId             ? '✓ set' : '✗ MISSING');
  const missing = getMissingVars();
  if (missing.length > 0) {
    console.error('[Firebase] MISSING required vars:', missing.join(', '));
    console.error('[Firebase] Add them in Vercel → Project Settings → Environment Variables, then redeploy.');
  } else {
    console.log('[Firebase] All required env vars present.');
  }
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  // Re-check env at call time (not at import time)
  const missing = getMissingVars();
  if (missing.length > 0) {
    console.warn('[Firebase] getFirebaseApp() — missing env vars:', missing.join(', '));
    return null;
  }
  if (_app) return _app;
  // Reuse an already-initialized app (e.g. SSR / hot-reload)
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }
  try {
    _app = initializeApp(readEnv());
    console.log('[Firebase] App initialized. Project:', readEnv().projectId);
  } catch (e) {
    console.error('[Firebase] initializeApp() threw:', e);
    return null;
  }
  return _app;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (_auth) return _auth;
  try {
    if (Platform.OS !== 'web') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getReactNativePersistence } = require('firebase/auth');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } else {
      _auth = getAuth(app);
    }
    console.log('[Firebase] Auth initialized. Platform:', Platform.OS);
  } catch (e) {
    console.error('[Firebase] Auth init threw:', e, '— falling back to getAuth()');
    try { _auth = getAuth(app); } catch (e2) {
      console.error('[Firebase] getAuth() also failed:', e2);
    }
  }
  return _auth;
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!_db) _db = getFirestore(app);
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!_storage) _storage = getStorage(app);
  return _storage;
}
