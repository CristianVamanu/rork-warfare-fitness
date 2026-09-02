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
import { resolveTrainerId, invalidateWorkoutsCache, invalidateProgramsCache, invalidateChannelsCache } from './firestore';

// signUp() writes the initial users/{uid} doc itself, but Firebase's
// onAuthStateChanged fires the moment createUserWithEmailAndPassword
// resolves — independently, and possibly before signUp() has gotten to its
// own Firestore write. AuthContext's ensureUserDoc() (a safety-net that
// runs on every sign-in) reacts to that same auth-state change, so the two
// can race to create the same doc. ensureUserDoc()'s transaction handles
// losing that race safely in the common case, but this flag closes the
// window entirely for the case signUp() actually causes: skip the
// safety-net outright for a uid signUp() is actively handling, since it's
// provably redundant then.
const pendingSignups = new Set<string>();
export function isPendingSignup(uid: string): boolean {
  return pendingSignups.has(uid);
}

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
  pendingSignups.add(credential.user.uid);

  try {
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
  } finally {
    // Whether our write succeeded or failed, ensureUserDoc() should go back
    // to running normally for this uid — on failure, it's actually the
    // only remaining path that can create the doc at all.
    pendingSignups.delete(credential.user.uid);
  }

  // Seed the public leaderboard mirror too — see firestore.ts
  // syncLeaderboardPublic. Without this, a brand-new user's leaderboard row
  // wouldn't exist until their first workout/quest/streak sync.
  await setDoc(doc(db, 'leaderboardPublic', credential.user.uid), {
    displayName,
    xp: 0,
    powerLevel: 1,
    streak: 0,
    totalWorkouts: 0,
    totalWeightLifted: 0,
    questsCompleted: [],
  }).catch((err) => console.error('[Auth] leaderboardPublic seed failed:', err));

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
  // firestore.ts keeps short-lived module-level caches (workouts, programs,
  // channels) that outlive a sign-out, since nothing about a Firebase sign-out
  // touches module state. The workout cache is keyed by uid so it can't serve
  // one user's history to another, and programs/channels are the same shared
  // data for everyone — but on a shared device it is still wrong to leave the
  // previous account's fetched data sitting in memory for the next person, and
  // clearing costs nothing.
  await firebaseSignOut(auth);
  invalidateWorkoutsCache();
  invalidateProgramsCache();
  invalidateChannelsCache();
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
