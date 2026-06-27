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
import { getSystemConfig } from './firestore';

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

  // Resolve trainerId from system config (set during install)
  let trainerId: string | undefined;
  try {
    const cfg = await getSystemConfig();
    trainerId = (cfg?.trainerId as string) ?? undefined;
  } catch {
    // Non-fatal: trainerId will be undefined for legacy installs
  }

  const userData = {
    displayName,
    email,
    photoURL: null,
    weightUnit,
    role: 'user',
    trainerId: trainerId ?? null,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
    onboardingComplete: false,
    stats: { streak: 0, powerLevel: 1, totalWorkouts: 0, totalWeightLifted: 0 },
  };
  console.log('[Auth] Writing Firestore user doc at users/', credential.user.uid);
  await setDoc(doc(db, 'users', credential.user.uid), userData);
  console.log('[Auth] Firestore user doc written successfully');

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
