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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  console.log('[Firebase] Initialized successfully. Project:', firebaseConfig.projectId);
} catch (err: unknown) {
  const e = err as Error & { code?: string };
  console.error('[Firebase] Initialization FAILED:', {
    code: e?.code,
    message: e?.message,
    stack: e?.stack,
  });
  // Re-export stubs only so the module doesn't crash at import time.
  // The real error will surface when signIn/signUp is called.
  app = {} as FirebaseApp;
  auth = {} as Auth;
  db = {} as Firestore;
  storage = {} as FirebaseStorage;
}

export { auth, db, storage };
export default app;
