import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { doc, onSnapshot, getDoc, type DocumentSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

/**
 * Signup, end to end, against the real thing.
 *
 * Runs the production signUp() — not a mock of it — against the Firebase Auth
 * and Firestore emulators with the repository's own firestore.rules loaded,
 * then does exactly what AuthContext does afterwards: waits on the signup
 * gate and attaches a profile listener. The test passes only if that listener
 * receives a profile.
 *
 * This is the test that did not exist when new accounts stopped working. The
 * rules suite proved the rules allowed signup; the unit suite proved the pure
 * functions; nothing proved that creating an account produced a profile the
 * app could see. Run with the emulators (`npm run test:rules`).
 */

vi.mock('./firebase', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');

  const app = initializeApp({ projectId: 'demo-warfare', apiKey: 'fake-api-key', authDomain: 'localhost' }, 'signup-e2e');
  const auth = getAuth(app);
  const db = getFirestore(app);

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(db, fsHost, Number(fsPort));

  return { auth, db, storage: {}, default: app };
});

import { auth, db } from './firebase';
import { signUp, awaitSignupInFlight } from './auth';

const email = `e2e-${Date.now()}@example.com`;

beforeAll(async () => {
  // The emulator has no config document. resolveTrainerId() tolerates that
  // (it returns null), which is also the production state for a single-tenant
  // install, so nothing needs seeding.
});

afterAll(async () => {
  await signOut(auth).catch(() => {});
});

describe('signup end to end (Auth + Firestore emulators, real rules)', () => {
  it('creating an account produces a profile the app can see', async () => {
    const user = await signUp(email, 'correct-horse-battery', 'E2E Member');
    expect(user.uid).toBeTruthy();

    // What AuthContext does next, in the same order.
    await awaitSignupInFlight();

    const snap = await new Promise<DocumentSnapshot>((resolve, reject) => {
      const unsub = onSnapshot(
        doc(db, 'users', user.uid),
        (s) => { if (s.exists()) { unsub(); resolve(s); } },
        (err) => { unsub(); reject(err); },
      );
      setTimeout(() => { unsub(); reject(new Error('profile listener never received the document')); }, 10_000);
    });

    const profile = snap.data()!;
    expect(profile.role).toBe('user');
    expect(profile.displayName).toBe('E2E Member');
    expect(profile.email).toBe(email);
    expect(profile.onboardingComplete).toBe(false);
  });

  it('the profile is readable by its owner under the real rules', async () => {
    const uid = auth.currentUser!.uid;
    const snap = await getDoc(doc(db, 'users', uid));
    expect(snap.exists()).toBe(true);
  });
});
