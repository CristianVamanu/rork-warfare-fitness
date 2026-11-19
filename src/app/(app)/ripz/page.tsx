'use client';

/**
 * Ripz: tear a pack, get a bodyweight challenge of 20 to 200 reps. Do it and
 * log it, or rip again for a different number, which may be higher or lower.
 * The rules live in lib/ripz; this page is the stage around the pack.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { Volume2, VolumeX, Check, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { rollChallenge, RIPZ_TIERS, type RipzChallenge, type RipzPackDef, type RipzTier } from '@/lib/ripz';
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

  const stats = (profile as unknown as { ripz?: { completed?: number; reps?: number; best?: number; bestMove?: string } } | null)?.ripz;

  async function done() {
    if (!user || !challenge || saving || logged) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ripz: {
          completed: increment(1), reps: increment(challenge.count), lastAt: serverTimestamp(),
          // Biggest pull finished so far, for the record tile.
          ...(challenge.count > (stats?.best ?? 0) ? { best: challenge.count, bestMove: challenge.move.name } : {}),
        },
      }, { merge: true });
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

        <div className={`mt-5 ${pack ? 'mb-16 min-h-[380px]' : 'mb-4'}`}>
          {pack && challenge
            ? <RipzPack pack={pack} challenge={challenge} audio={audio} packKey={packKey} onRevealed={() => setRevealed(true)} />
            : <RipzWheel audio={audio} onPick={pick} />}
        </div>

        {revealed && challenge && (
          <div className="space-y-2 wf-rise">
            {!logged ? (
              <Button fullWidth onClick={done} disabled={saving}><Check className="w-4 h-4" /> Done. Log it</Button>
            ) : (
              <p className="text-center text-sm font-bold text-accent py-2">Logged. Rip another when you are ready.</p>
            )}
            <Button fullWidth variant="secondary" onClick={again}><RotateCcw className="w-4 h-4" /> Rip another pack</Button>
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
            <div className="rounded-2xl border border-white/8 bg-surface p-3">
              <p className="wf-readout text-[10px] font-bold text-text-tertiary mb-2">What a pack can deal</p>
              <div className="space-y-1.5">
                {(Object.keys(RIPZ_TIERS) as RipzTier[]).map((t, i, all) => {
                  const tier = RIPZ_TIERS[t]; const next = all[i + 1]; const max = next ? RIPZ_TIERS[next].min - 5 : 200;
                  return (
                    <div key={t} className="flex items-center gap-2 text-xs">
                      <span className="w-16 font-bold" style={{ color: tier.color }}>{tier.label}</span>
                      <span className="w-20 text-text-secondary tabular-nums">{tier.min}–{max} reps</span>
                      <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${tier.chance * 100 / 0.35}%`, background: tier.color }} /></span>
                      <span className="w-9 text-right text-text-tertiary tabular-nums">{Math.round(tier.chance * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
