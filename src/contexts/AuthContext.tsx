'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
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

  const loadProfile = async (firebaseUser: User) => {
    const uid = firebaseUser.uid;

    // Guarantee user doc exists before any other reads/writes
    await ensureUserDoc(firebaseUser).catch((err) =>
      console.error('[Auth] ensureUserDoc failed:', err)
    );

    const data = await getUserDoc(uid);
    if (!data) {
      console.error('[Auth] Could not load profile for', uid);
      return;
    }
    const p = data as UserProfile;
    setProfile(p);

    if (p.trainerId) {
      getTenant(p.trainerId).then(setTenant).catch(console.error);
    }

    // Non-blocking stats migration + recompute
    checkAndRunMigration(uid)
      .then(() =>
        getUserDoc(uid)
          .then((updated) => { if (updated) setProfile(updated as UserProfile); })
          .catch(console.error)
      )
      .catch(console.error);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser);
      } else {
        setProfile(null);
        setTenant(null);
      }
      setLoading(false);
    });
    return unsub;
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
