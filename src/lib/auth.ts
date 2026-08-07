import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createTenant } from './tenants';
import { resolveTrainerId } from './firestore';

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  weightUnit: 'kg' | 'lbs' = 'kg'
) {
  console.log('[Auth] signUp() called — email:', email, 'displayName:', displayName);

  console.log('[Auth] Calling createUserWithEmailAndPassword...');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  console.log('[Auth] createUserWithEmailAndPassword succeeded — uid:', credential.user.uid);

  console.log('[Auth] Calling updateProfile...');
  await updateProfile(credential.user, { displayName });
  console.log('[Auth] updateProfile succeeded');

  // Shared with AuthContext's ensureUserDoc(), which can race this same
  // write right after createUserWithEmailAndPassword — see the comment
  // there for why the two must resolve trainerId identically.
  const trainerId = await resolveTrainerId();

  const userData = {
    displayName,
    email,
    photoURL: null,
    weightUnit,
    role: 'user',
    trainerId,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
    onboardingComplete: false,
    stats: { streak: 0, powerLevel: 1, totalWorkouts: 0, totalWeightLifted: 0 },
    // Captured once at signup so server-side jobs (the daily notification
    // cron) can compute "today"/"yesterday" in the user's own timezone
    // instead of the server's — without this, streak/missed-workout
    // notifications compare dates across mismatched day boundaries for
    // anyone not in the same timezone as the VPS.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  console.log('[Auth] Writing Firestore user doc at users/', credential.user.uid);
  await setDoc(doc(db, 'users', credential.user.uid), userData);
  console.log('[Auth] Firestore user doc written successfully');

  credential.user.getIdToken().then((token) => {
    fetch('/api/email/welcome', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Non-fatal — welcome email is best-effort
    });
  }).catch(() => {
    // Non-fatal
  });

  return credential.user;
}

export async function signIn(email: string, password: string) {
  console.log('[Auth] signIn() called — email:', email);
  console.log('[Auth] Calling signInWithEmailAndPassword...');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  console.log('[Auth] signInWithEmailAndPassword succeeded — uid:', credential.user.uid);
  return credential.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Creates the admin (trainer) account and the corresponding tenant record.
 * trainerId == the admin user's uid.
 */
export async function createAdminUser(
  email: string,
  password: string,
  name: string
) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  try {
    await updateProfile(credential.user, { displayName: name });

    await setDoc(doc(db, 'users', uid), {
      displayName: name,
      email,
      photoURL: null,
      weightUnit: 'kg',
      role: 'admin',
      trainerId: uid,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      stats: { streak: 0, powerLevel: 100, totalWorkouts: 0, totalWeightLifted: 0 },
    });

    await createTenant(uid, name, email);

    return credential.user;
  } catch (err) {
    // If Firestore writes fail (e.g. rules not deployed), clean up the Auth user
    // so the installer can retry without hitting "email-already-in-use".
    await credential.user.delete().catch(() => {});
    throw err;
  }
}
