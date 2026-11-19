'use client';

/**
 * The 30-day Ripz challenge for a signed-in member. The screen and its rules
 * live in components/ripz/RipzChallengeScreen and lib/ripzChallenge; this
 * page keeps the record on the member's profile (`ripzChallenge`) and adds
 * each finished day to their Ripz totals.
 */
import { useMemo, useRef } from 'react';
import { doc, setDoc, updateDoc, increment, serverTimestamp, deleteField } from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalDate } from '@/hooks/useLocalDate';
import { Header } from '@/components/layout/Header';
import { RipzChallengeScreen, type ChallengeStore } from '@/components/ripz/RipzChallengeScreen';
import type { ChallengeRecord } from '@/lib/ripzChallenge';

export default function RipzChallengePage() {
  const { user, profile, refreshProfile } = useAuth();
  const today = useLocalDate();
  const rec = (profile as unknown as { ripzChallenge?: ChallengeRecord } | null)?.ripzChallenge ?? null;
  const best = (profile as unknown as { ripz?: { best?: number } } | null)?.ripz?.best ?? 0;
  const refCode = useRef<string | null>(null);

  const store = useMemo<ChallengeStore>(() => {
    const ref = () => doc(db, 'users', user!.uid);
    // Offline, a Firestore write waits for the network before it resolves,
    // though it is already queued on the device. Do not hang the screen on it.
    const save = async (write: Promise<void>) => {
      await Promise.race([write, new Promise((r) => setTimeout(r, 2500))]);
      write.catch((err) => console.error('[ripz challenge] save failed', err));
      void refreshProfile();
    };
    return {
      // updateDoc replaces the whole field, so an old run's days cannot leak into the new one.
      start: (completed) => save(updateDoc(ref(), { ripzChallenge: { startedAt: today, days: {}, pending: null, completed } })),
      savePending: (p) => save(setDoc(ref(), { ripzChallenge: { pending: p } }, { merge: true })),
      logDay: (day, p) => save(setDoc(ref(), {
        ripzChallenge: { days: { [String(day)]: { count: p.count, move: p.move, date: today } }, pending: deleteField() },
        ripz: {
          completed: increment(1), reps: increment(p.count), lastAt: serverTimestamp(),
          ...(p.count > best ? { best: p.count, bestMove: p.move } : {}),
        },
      }, { merge: true })),
      getRef: async () => {
        if (refCode.current || !user) return refCode.current;
        const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
        const body = await res.json().catch(() => ({}));
        refCode.current = res.ok && typeof body.code === 'string' ? body.code : null;
        return refCode.current;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today, best]);

  if (!user) return null;
  return (
    <div>
      <Header />
      <RipzChallengeScreen rec={rec} today={today} store={store} />
    </div>
  );
}
