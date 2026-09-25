'use client';

import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Which gated products this viewer has earned. Signed out: none, and
 * `signedIn` false so the page can say "log in" rather than "finish a
 * challenge". The checkout route re-checks; this only shapes the button.
 */
export function useUnlocks() {
  const { user, loading } = useAuth();
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [verified, setVerified] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setUnlocked(new Set()); setVerified([]); setReady(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/shop/unlocks', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setUnlocked(new Set<string>(Array.isArray(data.unlocked) ? data.unlocked : []));
        setVerified(Array.isArray(data.verified) ? data.verified : []);
      } catch { /* treated as nothing unlocked */ }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user, loading]);

  return { unlocked, verified, signedIn: !!user, ready };
}
