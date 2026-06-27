import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

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

  const userData = {
    displayName,
    email,
    photoURL: null,
    weightUnit,
    role: 'user',
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
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

export async function createAdminUser(
  email: string,
  password: string,
  name: string
) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await setDoc(doc(db, 'users', credential.user.uid), {
    displayName: name,
    email,
    photoURL: null,
    weightUnit: 'kg',
    role: 'admin',
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
    stats: { streak: 0, powerLevel: 100, totalWorkouts: 0, totalWeightLifted: 0 },
  });
  return credential.user;
}
