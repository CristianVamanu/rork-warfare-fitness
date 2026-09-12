'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getUserDoc, resolveTrainerId } from '@/lib/firestore';
import { isPendingSignup, awaitSignupInFlight } from '@/lib/auth';
import { getTenant } from '@/lib/tenants';
import { checkAndRunMigration } from '@/lib/migration';
import type { UserProfile, Tenant } from '@/types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  tenant: Tenant | null;
  trainerId: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  tenant: null,
  trainerId: null,
  loading: true,
  refreshProfile: async () => {},
});

// Create a default user doc when one is missing (e.g. OAuth sign-in,
// or a user whose Firestore doc was never written due to rules errors).
//
// This used to read-then-write as two separate calls (getUserDoc, then a
// merge setDoc). A transient false negative on the read — observed after
// clearing browser storage, where the very first Firestore read can race
// with Auth's ID token propagating — made it treat an EXISTING doc as
// missing and overwrite role/createdAt/onboardingComplete/stats via merge,
// silently demoting an admin account back to 'user'. A transaction makes
// the check-and-create atomic against Firestore's own view of the
// document, not a separate client-side read that can go stale.
async function ensureUserDoc(firebaseUser: User): Promise<void> {
  const ref = doc(db, 'users', firebaseUser.uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;

    // Resolved via the SAME shared helper signUp() uses (src/lib/auth.ts),
    // not a separate copy of the same logic — this function and signUp()
    // both race to create the same fresh user doc right after
    // createUserWithEmailAndPassword (onAuthStateChanged fires immediately,
    // so this can run concurrently with signUp()'s own explicit doc write).
    // Firestore's security rules forbid trainerId from ever being CHANGED
    // on an update (by design — it's how a client could otherwise grant
    // itself access to another trainer's tenant). If the two writers
    // resolved trainerId differently (or one omitted it), whichever write
    // landed second — now an update, since the doc exists — would get
    // rejected as an unauthorized "change". A shared resolver guarantees
    // agreement instead of relying on two copies staying in sync by hand.
    //
    // Called here, inside the transaction after the existence check, not
    // before it — this is the ensureUserDoc() safety-net path that also
    // runs on every ordinary login/session-restore for already-onboarded
    // users, where snap.exists() is true and trainerId is never used;
    // resolving it up front would cost every login an extra Firestore read
    // (up to the full 3s timeout on a slow network) for a value that gets
    // thrown away immediately.
    const trainerId = await resolveTrainerId();

    console.info('[Auth] Creating missing Firestore doc for', firebaseUser.uid);
    tx.set(ref, {
      id: firebaseUser.uid,
      displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User',
      email: firebaseUser.email ?? '',
      photoURL: firebaseUser.photoURL ?? null,
      weightUnit: 'kg',
      role: 'user',
      trainerId,
      onboardingComplete: false,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      stats: {
        streak: 0,
        // 1, not 0 — matches signUp()'s seed in auth.ts and xpToPowerLevel(0).
        powerLevel: 1,
        totalWorkouts: 0,
        totalWeightLifted: 0,
      },
    });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef<(() => void) | null>(null);

  const subscribeToProfile = (firebaseUser: User, authErrorRetries = 0) => {
    const uid = firebaseUser.uid;

    // Cancel any previous listener
    profileUnsubRef.current?.();

    // Right after onAuthStateChanged fires with a new user (especially when
    // switching accounts in the same session), the Firestore SDK's
    // underlying connection needs a brief moment to actually attach the new
    // ID token — Firestore requests issued in that window can transiently
    // fail with permission-denied even though the user IS properly signed
    // in. Forcing a fresh token here (rather than relying on whatever's
    // cached) closes most of that gap before the first Firestore call.
    firebaseUser.getIdToken(true).catch(() => {}).then(() => awaitSignupInFlight()).then(() => {
      // signUp() just wrote (or is actively writing) this exact doc itself
      // — running the transactional check-and-create here too is not just
      // redundant, it's the actual race that was surfacing as a permission
      // error on new-user onboarding (this transaction's write racing
      // signUp()'s own write to the same doc). Skipping it here closes
      // that window entirely instead of relying on the transaction to lose
      // the race gracefully.
      // awaitSignupInFlight() above means signUp() has already written this
      // document (or failed trying), so there is no write left to race. The
      // safety net runs either way now: ensureUserDoc returns early when the
      // document is there, and is the only thing that can create it when
      // signUp's own write did not land.
      const ensureTask = isPendingSignup(uid)
        ? Promise.resolve()
        : ensureUserDoc(firebaseUser).catch((err) => console.error('[Auth] ensureUserDoc failed:', err));
      // Guarantee user doc exists first, then open a real-time listener
      ensureTask
        .then(() => {
          // Record login time on every session start — ensureUserDoc only sets
          // this once (at account creation, via its merge-and-return-early
          // guard), so it doesn't reflect actual last-login without this.
          setDoc(doc(db, 'users', uid), { lastLoginAt: serverTimestamp() }, { merge: true }).catch(() => {});
          const unsub = onSnapshot(
            doc(db, 'users', uid),
            (snap) => {
              if (!snap.exists()) return;
              const p = snap.data() as UserProfile;
              setProfile(p);
              if (p.trainerId) {
                getTenant(p.trainerId).then(setTenant).catch(console.error);
              }
            },
            (err) => {
              console.error('[Auth] profile listener error:', err);
              // Self-heal from the token-propagation race above instead of
              // leaving the user stuck on placeholder data until they
              // manually refresh. One retry at 1.5s was not enough: on a
              // brand-new signup the live log showed both the first attempt
              // and the single retry denied, and the doc write itself only
              // acknowledged after that — so the listener was dead by the
              // time the profile existed, and the member never got past
              // onboarding. Back off up to five times (about 20s in total),
              // which outlasts any token attach seen so far.
              if (authErrorRetries < 5 && err.code === 'permission-denied') {
                const delay = 1500 * (authErrorRetries + 1);
                setTimeout(() => subscribeToProfile(firebaseUser, authErrorRetries + 1), delay);
              }
            },
          );
          profileUnsubRef.current = unsub;

          // Non-blocking stats migration — moved inside this same
          // getIdToken(true) chain (it used to fire immediately, outside
          // it) so its own Firestore reads get the same token-propagation
          // protection as everything else here, instead of racing ahead of
          // the connection's auth handshake on a brand-new sign-in.
          checkAndRunMigration(uid).catch(console.error);
        });
    });
  };

  const refreshProfile = async () => {
    if (user) {
      const data = await getUserDoc(user.uid);
      if (data) setProfile(data as UserProfile);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        subscribeToProfile(firebaseUser);
      } else {
        profileUnsubRef.current?.();
        profileUnsubRef.current = null;
        setProfile(null);
        setTenant(null);
      }
      setLoading(false);
    });
    return () => {
      unsub();
      profileUnsubRef.current?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const trainerId = profile?.trainerId ?? null;

  return (
    <AuthContext.Provider value={{ user, profile, tenant, trainerId, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
