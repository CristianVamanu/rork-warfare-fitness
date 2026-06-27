'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserDoc } from '@/lib/firestore';
import { getTenant } from '@/lib/tenants';
import { recomputeStatsCache } from '@/lib/events';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const data = await getUserDoc(uid);
    if (!data) return;
    const p = data as UserProfile;
    setProfile(p);

    // Load tenant if trainerId is known
    const tid = p.trainerId;
    if (tid) {
      getTenant(tid).then(setTenant).catch(console.error);
    }

    // Refresh stats cache on login (non-blocking)
    recomputeStatsCache(uid).catch(console.error);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.uid);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadProfile(firebaseUser.uid);
      } else {
        setProfile(null);
        setTenant(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

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
