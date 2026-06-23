/**
 * Firebase client singleton — single source of truth.
 * Initialized ONLY from NEXT_PUBLIC_FIREBASE_* environment variables.
 * No runtime config, no AsyncStorage fallback, no admin override.
 */
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const REQUIRED = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

// ─── Startup diagnostic — runs once when the module is first imported ─────────
console.log('[Firebase] ENV var diagnostic:');
console.log('  NEXT_PUBLIC_FIREBASE_API_KEY            =', ENV.NEXT_PUBLIC_FIREBASE_API_KEY            ? '✓ set' : '✗ MISSING');
console.log('  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        =', ENV.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ? '✓ set' : '✗ MISSING');
console.log('  NEXT_PUBLIC_FIREBASE_PROJECT_ID         =', ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ? '✓ set' : '✗ MISSING');
console.log('  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     =', ENV.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ? '✓ set' : '✗ MISSING (optional)');
console.log('  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=', ENV.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✓ set' : '✗ MISSING (optional)');
console.log('  NEXT_PUBLIC_FIREBASE_APP_ID             =', ENV.NEXT_PUBLIC_FIREBASE_APP_ID             ? '✓ set' : '✗ MISSING');

const missingVars = REQUIRED.filter(k => !ENV[k]);

if (missingVars.length > 0) {
  console.error(
    '[Firebase] INIT FAILED — missing required env vars:',
    missingVars.join(', '),
    '\nAdd them to Vercel → Project Settings → Environment Variables, then redeploy.'
  );
} else {
  console.log('[Firebase] All required env vars present — will initialize on first use.');
}
// ─────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            ENV.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        ENV.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     ENV.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return missingVars.length === 0;
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (_app) return _app;
  try {
    _app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized. Project:', firebaseConfig.projectId);
  } catch (e) {
    console.error('[Firebase] initializeApp() threw:', e);
    return null;
  }
  return _app;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) {
    console.error('[Firebase] getFirebaseAuth() → no app. Missing env vars:', missingVars.join(', ') || 'none');
    return null;
  }
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
