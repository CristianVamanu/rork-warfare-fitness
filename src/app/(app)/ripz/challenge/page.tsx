'use client';

/**
 * The 30-day Ripz challenge for a signed-in member. The screen and its rules
 * live in components/ripz/RipzChallengeScreen and lib/ripzChallenge; this
 * page keeps the record on the member's profile (`ripzChallenge`) and adds
 * each finished day to their Ripz totals.
 */
import { useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { doc, setDoc, updateDoc, increment, serverTimestamp, deleteField, arrayUnion } from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalDate } from '@/hooks/useLocalDate';
import { Header } from '@/components/layout/Header';
import { RipzChallengeScreen, type ChallengeStore } from '@/components/ripz/RipzChallengeScreen';
import { challengeBadges, type ChallengeRecord } from '@/lib/ripzChallenge';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';

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
      start: (completed, level) => save(updateDoc(ref(), { ripzChallenge: { startedAt: today, days: {}, pending: null, completed, level } })),
      // No startedAt = not in a challenge. The finished count is kept for the badge.
      quit: (completed) => save(updateDoc(ref(), { ripzChallenge: { completed } })),
      savePending: (p) => save(setDoc(ref(), { ripzChallenge: { pending: p } }, { merge: true })),
      logDay: (day, p) => save(setDoc(ref(), {
        ripzChallenge: { days: { [String(day)]: { count: p.count, move: p.move, date: today } }, pending: deleteField() },
        ripz: {
          completed: increment(1), lastAt: serverTimestamp(),
          // A plank day is seconds held, kept apart from the rep total.
          ...(p.moveId === 'plank' ? { plankSeconds: increment(p.count) } : { reps: increment(p.count) }),
          ...(p.moveId !== 'plank' && p.count > best ? { best: p.count, bestMove: p.move } : {}),
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

  // Badges follow from the stored record, so they are granted here whenever
  // the page sees one that is earned and not yet on the profile: after day 7
  // is logged, on finishing, and for a finish reached by the calendar alone.
  // arrayUnion makes a repeat harmless.
  const have = (profile as unknown as { achievements?: string[] } | null)?.achievements;
  const owed = challengeBadges(rec, today).filter((id) => !(have ?? []).includes(id)).join(',');
  useEffect(() => {
    if (!user || !profile || !owed) return;
    const ids = owed.split(',');
    setDoc(doc(db, 'users', user.uid), { achievements: arrayUnion(...ids) }, { merge: true })
      .then(() => {
        for (const id of ids) { const d = ACHIEVEMENT_DEFS.find((x) => x.id === id); if (d) toast.success(`${d.icon} Badge earned: ${d.title}`); }
        void refreshProfile();
      })
      .catch((err) => console.error('[ripz challenge] badge failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owed, user?.uid]);

  if (!user) return null;
  return (
    <div>
      <Header />
      <RipzChallengeScreen rec={rec} today={today} store={store} />
    </div>
  );
}
