'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getUserDoc } from '@/lib/firestore';
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

    console.info('[Auth] Creating missing Firestore doc for', firebaseUser.uid);
    tx.set(ref, {
      id: firebaseUser.uid,
      displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User',
      email: firebaseUser.email ?? '',
      photoURL: firebaseUser.photoURL ?? null,
      weightUnit: 'kg',
      role: 'user',
      onboardingComplete: false,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      stats: {
        streak: 0,
        powerLevel: 0,
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

  const subscribeToProfile = (firebaseUser: User, retriedAfterAuthError = false) => {
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
    firebaseUser.getIdToken(true).catch(() => {}).then(() => {
      // Guarantee user doc exists first, then open a real-time listener
      ensureUserDoc(firebaseUser)
        .catch((err) => console.error('[Auth] ensureUserDoc failed:', err))
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
              // manually refresh — one retry, ~1.5s later, is enough once
              // the token has actually attached.
              if (!retriedAfterAuthError && err.code === 'permission-denied') {
                setTimeout(() => subscribeToProfile(firebaseUser, true), 1500);
              }
            },
          );
          profileUnsubRef.current = unsub;
        });
    });

    // Non-blocking stats migration
    checkAndRunMigration(uid).catch(console.error);
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
