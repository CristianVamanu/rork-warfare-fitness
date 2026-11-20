'use client';

/**
 * Ripz: tear a pack, get a bodyweight challenge of 20 to 200 reps. Do it and
 * log it, or rip again for a different number, which may be higher or lower.
 * The rules live in lib/ripz; this page is the stage around the pack.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import { Volume2, VolumeX, Check, RotateCcw, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { rollChallenge, type RipzChallenge, type RipzPackDef } from '@/lib/ripz';
import { RipzOdds } from '@/components/ripz/RipzOdds';
import { useLocalDate } from '@/hooks/useLocalDate';
import { challengeView, CHALLENGE_DAYS, type ChallengeRecord } from '@/lib/ripzChallenge';
import { RipzShare } from '@/components/ripz/RipzShare';
import { getIdToken } from 'firebase/auth';
import { RipzWheel } from '@/components/ripz/RipzWheel';
import { RipzPack } from '@/components/ripz/RipzPack';
import { RipzAudio } from '@/components/ripz/ripzAudio';

const MUTE_KEY = 'wf.ripz.muted';

export default function RipzPage() {
  const { user, profile, refreshProfile } = useAuth();
  const audio = useMemo(() => new RipzAudio(), []);
  const [muted, setMuted] = useState(false);
  const [packKey, setPackKey] = useState(0);
  const [challenge, setChallenge] = useState<RipzChallenge | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const last = useRef<RipzChallenge | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  // On a short screen the buttons land below the fold; bring them up.
  useEffect(() => { if (revealed) actions.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [revealed]);

  const [pack, setPack] = useState<RipzPackDef | null>(null);

  useEffect(() => {
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; setMuted(m); audio.muted = m; } catch { /* private mode */ }
    return () => audio.close();
  }, [audio]);

  function toggleMute() {
    const m = !muted; setMuted(m); audio.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  }

  // Picked off the wheel: the colour fixes the move, the pack deals the number.
  function pick(p: RipzPackDef) {
    const next = rollChallenge(last.current, Math.random, p.moveId); last.current = next;
    setPack(p); setChallenge(next); setRevealed(false); setLogged(false); setPackKey((k) => k + 1);
  }

  /** Back to the wheel for another pack. */
  function again() { setPack(null); setChallenge(null); setRevealed(false); setLogged(false); }

  const today = useLocalDate();
  const chal = challengeView((profile as unknown as { ripzChallenge?: ChallengeRecord } | null)?.ripzChallenge ?? null, today);
  const stats = (profile as unknown as { ripz?: { completed?: number; reps?: number; best?: number; bestMove?: string } } | null)?.ripz;

  // The member's referral code, fetched the first time they share: the link
  // then pays out the free month if the friend subscribes.
  const refCode = useRef<string | null>(null);
  async function referralCode(): Promise<string | null> {
    if (refCode.current || !user) return refCode.current;
    const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
    const body = await res.json().catch(() => ({}));
    refCode.current = res.ok && typeof body.code === 'string' ? body.code : null;
    return refCode.current;
  }

  async function done() {
    if (!user || !challenge || saving || logged) return;
    setSaving(true);
    try {
      // Offline, a Firestore write waits for the network before it resolves,
      // though it is already saved on the device and will sync. Do not leave
      // the button spinning on it: after a moment, count it as logged.
      const write = setDoc(doc(db, 'users', user.uid), {
        ripz: {
          completed: increment(1), reps: increment(challenge.count), lastAt: serverTimestamp(),
          // Biggest pull finished so far, for the record tile.
          ...(challenge.count > (stats?.best ?? 0) ? { best: challenge.count, bestMove: challenge.move.name } : {}),
        },
      }, { merge: true });
      await Promise.race([write, new Promise((r) => setTimeout(r, 2500))]);
      write.catch((err) => console.error('[ripz] log failed', err));
      setLogged(true);
      toast.success(`${challenge.count} ${challenge.move.name.toLowerCase()} logged`);
      void refreshProfile();
    } catch (err) {
      console.error('[ripz] log failed', err);
      toast.error('Could not save that. Try again.');
    } finally {
      setSaving(false);
    }
  }


  return (
    <div>
      <Header />
      <div className="px-4 pt-2 max-w-md mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="wf-readout text-[10px] font-bold text-accent">Pick a pack. Rip it. Do the work.</p>
            <h1 className="text-3xl font-black italic text-white">RIPZ</h1>
          </div>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} className="p-2 rounded-xl border border-white/10 text-text-secondary hover:text-white">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        <div className={`mt-5 ${pack ? (revealed ? 'mb-16' : 'mb-28') + ' min-h-[380px]' : 'mb-4'}`}>
          {pack && challenge
            ? <RipzPack pack={pack} challenge={challenge} audio={audio} packKey={packKey} onRevealed={() => setRevealed(true)} onBack={again} />
            : <RipzWheel audio={audio} onPick={pick} />}
        </div>

        {revealed && challenge && (
          <div ref={actions} className="space-y-2 wf-rise scroll-mb-28">
            {!logged ? (
              <Button fullWidth onClick={done} disabled={saving}><Check className="w-4 h-4" /> Done. Log it</Button>
            ) : (
              <p className="text-center text-sm font-bold text-accent py-2">Logged. Rip another when you are ready.</p>
            )}
            <RipzShare challenge={challenge} getRef={referralCode} />
            <Button fullWidth variant="ghost" onClick={again}><RotateCcw className="w-4 h-4" /> Rip another pack</Button>
            {!logged && <p className="text-center text-[11px] text-text-tertiary">A new pack can deal more or fewer. Never zero.</p>}
          </div>
        )}

        {/* Under the wheel: the member's record and what the packs can deal. */}
        {!pack && (
          <div className="space-y-3 mt-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Packs done', value: (stats?.completed ?? 0).toLocaleString() },
                { label: 'Total reps', value: (stats?.reps ?? 0).toLocaleString() },
                { label: 'Best pull', value: stats?.best ? String(stats.best) : '–' },
              ].map((t) => (
                <div key={t.label} className="rounded-2xl border border-white/8 bg-surface px-2 py-3 text-center">
                  <p className="text-xl font-black text-white tabular-nums">{t.value}</p>
                  <p className="wf-readout text-[9px] font-bold text-text-tertiary mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
            {/* The 30-day challenge is opt-in and lives here, not on the home screen. */}
            <Link href="/ripz/challenge" className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3">
              <span className="flex-1">
                {chal.state === 'active' ? (
                  <>
                    <span className="block text-sm font-black text-white">30-day challenge · Day {chal.day} of {CHALLENGE_DAYS}</span>
                    <span className="block text-xs text-text-secondary">{chal.doneToday ? 'Done for today. Come back tomorrow.' : `Today's pack is waiting: ${chal.range.min}–${chal.range.max} reps.`}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm font-black text-white">Want more? Take the 30-day challenge</span>
                    <span className="block text-xs text-text-secondary">One pack a day. It ramps up every week.</span>
                  </>
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-accent" />
            </Link>
            <RipzOdds />
          </div>
        )}
      </div>
    </div>
  );
}
