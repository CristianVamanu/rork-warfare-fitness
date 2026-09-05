import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
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
  console.log('[Auth] signUp() called');

  console.log('[Auth] Calling createUserWithEmailAndPassword...');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  console.log('[Auth] createUserWithEmailAndPassword succeeded — uid:', credential.user.uid);
  pendingSignups.add(credential.user.uid);

  try {
    console.log('[Auth] Calling updateProfile...');
    await updateProfile(credential.user, { displayName });
    console.log('[Auth] updateProfile succeeded');

    // Nothing verified the address before this. Any string that looked like
    // an email got a full account, a trial, and 2FA codes sent to an inbox
    // nobody controls — and trial farming with throwaway addresses was a
    // one-line script. Sending the verification mail here is fire-and-forget:
    // onboarding must not stall on it, and the gates that actually care
    // (trial access, paid-trial checkout, 2FA enrolment) check
    // emailVerified on the token at the moment it matters.
    // No verification email is sent from here any more. Confirmation is by
    // 6-digit code now (api/auth/verify-email/*), and VerifyEmailNotice
    // requests one as soon as the member lands on the gate — which is both
    // fewer moving parts and the only way the confirmation can happen inside
    // the PWA rather than in whichever browser the OS decides to open.

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
  console.log('[Auth] signIn() called');
  console.log('[Auth] Calling signInWithEmailAndPassword...');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  console.log('[Auth] signInWithEmailAndPassword succeeded — uid:', credential.user.uid);
  return credential.user;
}

// resendVerificationEmail() REMOVED — email confirmation is by 6-digit code
// now (api/auth/verify-email/*), which is the only version that can complete
// inside the PWA rather than in whichever browser the OS opens the link with.
// Don't reintroduce a link-based verification path here; sendAuthEmail below
// is still used for password RESET, where a link is the right shape because
// the member is signed out and typing a new password in a browser anyway.

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
  await sendAuthEmail(email, 'reset', () => sendPasswordResetEmail(auth, email));
}

/**
 * Sends an auth email from the app's own domain via Resend, falling back to
 * Firebase's built-in sender if that isn't possible.
 *
 * Firebase's own sender uses noreply@<project>.firebaseapp.com, which has no
 * SPF/DKIM alignment with this app's domain and reliably lands in spam. That
 * is worse than cosmetic: email verification gates trial access, so a
 * verification mail nobody sees is a signup who can't reach the product.
 *
 * The fallback matters as much as the primary path — an install with no
 * RESEND_API_KEY set must still deliver *something*, and Firebase's spam-prone
 * email beats no email at all.
 */
async function sendAuthEmail(
  email: string | null,
  kind: 'verify' | 'reset',
  fallback: () => Promise<void>
): Promise<void> {
  if (!email) return fallback();
  try {
    const res = await fetch('/api/auth/send-auth-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, kind }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 429) {
      const mins = Math.max(1, Math.ceil((data?.retryAfter ?? 300) / 60));
      throw new Error(`Too many requests — try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    if (res.ok && data?.delivered) return;
    // ok-but-not-delivered means Resend isn't configured on this install.
    await fallback();
  } catch (err) {
    // A rate-limit refusal is a real answer and must reach the caller; any
    // other failure (offline, route down) falls back to Firebase.
    if (err instanceof Error && err.message.startsWith('Too many requests')) throw err;
    console.warn(`[Auth] branded ${kind} email failed, falling back to Firebase:`, err);
    await fallback();
  }
}

// createAdminUser() REMOVED — do not reintroduce a client-side path that
// writes role:'admin'. firestore.rules no longer permits it under any
// condition (the installerNotDone() exemption is gone), and setup now runs
// server-side in /api/install with the Admin SDK. A client helper here
// could only ever fail with permission-denied, or tempt someone into
// reopening the rule that left this deployment's installer exposed.
