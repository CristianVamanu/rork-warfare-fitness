'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
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
async function ensureUserDoc(firebaseUser: User): Promise<void> {
  const existing = await getUserDoc(firebaseUser.uid);
  if (existing) return;

  console.info('[Auth] Creating missing Firestore doc for', firebaseUser.uid);
  await setDoc(
    doc(db, 'users', firebaseUser.uid),
    {
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
    },
    { merge: true } // safe even if doc partially exists
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef<(() => void) | null>(null);

  const subscribeToProfile = (firebaseUser: User) => {
    const uid = firebaseUser.uid;

    // Cancel any previous listener
    profileUnsubRef.current?.();

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
          (err) => console.error('[Auth] profile listener error:', err),
        );
        profileUnsubRef.current = unsub;
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
