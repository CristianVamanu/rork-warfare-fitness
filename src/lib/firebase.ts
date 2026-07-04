import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Log config presence (never log values — they contain secrets)
console.log('[Firebase] Initializing with config keys present:', {
  apiKey: !!firebaseConfig.apiKey,
  authDomain: !!firebaseConfig.authDomain,
  projectId: !!firebaseConfig.projectId,
  storageBucket: !!firebaseConfig.storageBucket,
  messagingSenderId: !!firebaseConfig.messagingSenderId,
  appId: !!firebaseConfig.appId,
});

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain) {
  const missing = ['apiKey', 'projectId', 'authDomain']
    .filter(k => !firebaseConfig[k as keyof typeof firebaseConfig])
    .map(k => `NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
  console.error('[Firebase] MISSING environment variables:', missing.join(', '));
}

if (!firebaseConfig.storageBucket) {
  console.error(
    '[Firebase] NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set. ' +
    'Storage uploads (profile photos, community images, exercise videos) will fail ' +
    'with storage/no-default-bucket until this env var is set on your hosting platform. ' +
    'Find it in Firebase Console → Project Settings → General → Your apps → Web app config.'
  );
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('[Firebase] Auth + Firestore initialized. Project:', firebaseConfig.projectId);
} catch (err: unknown) {
  const e = err as Error & { code?: string };
  console.error('[Firebase] Core initialization FAILED:', {
    code: e?.code,
    message: e?.message,
    stack: e?.stack,
  });
  // Re-export stubs only so the module doesn't crash at import time.
  // The real error will surface when signIn/signUp is called.
  app = {} as FirebaseApp;
  auth = {} as Auth;
  db = {} as Firestore;
}

// Storage is initialized independently — a missing/misconfigured storageBucket
// must never take down Auth or Firestore, which the app can run fully without Storage.
try {
  storage = getStorage(app);
} catch (err: unknown) {
  const e = err as Error & { code?: string };
  console.error('[Firebase] Storage initialization FAILED (Auth/Firestore unaffected):', {
    code: e?.code,
    message: e?.message,
  });
  storage = {} as FirebaseStorage;
}

export { auth, db, storage };
export default app;
