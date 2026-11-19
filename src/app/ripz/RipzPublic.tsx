'use client';

/**
 * Ripz for anyone, no account: spin the wheel, rip a pack, get the number.
 * It is the front door the reels point at. Ripping and sharing are free;
 * saving reps and a best pull is what an account is for, so "Save it" leads
 * into signup and lands the new member on their own Ripz page. A signed-in
 * member who opens this URL is sent straight to that page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Volume2, VolumeX, RotateCcw, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { funnelHit } from '@/lib/funnel';
import { isValidReferralCode } from '@/lib/referral';
import { rollChallenge, RIPZ_MOVES, RIPZ_MIN, RIPZ_MAX, type RipzChallenge, type RipzPackDef } from '@/lib/ripz';
import { RipzPack } from '@/components/ripz/RipzPack';
import { RipzWheel } from '@/components/ripz/RipzWheel';
import { RipzAudio } from '@/components/ripz/ripzAudio';
import { RipzOdds } from '@/components/ripz/RipzOdds';
import { RipzShare } from '@/components/ripz/RipzShare';

const MUTE_KEY = 'wf.ripz.muted';

export function RipzPublic() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const audio = useMemo(() => new RipzAudio(), []);
  const [muted, setMuted] = useState(false);
  const [pack, setPack] = useState<RipzPackDef | null>(null);
  const [challenge, setChallenge] = useState<RipzChallenge | null>(null);
  const [packKey, setPackKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const last = useRef<RipzChallenge | null>(null);
  const actions = useRef<HTMLDivElement>(null);

  // The pull a friend shared, if this visit came from their link.
  const friend = useMemo(() => {
    const n = Number(params.get('n')); const move = RIPZ_MOVES.find((m) => m.id === params.get('m'));
    return move && Number.isInteger(n) && n >= RIPZ_MIN && n <= RIPZ_MAX ? { n, move } : null;
  }, [params]);
  const ref = params.get('ref');
  const joinHref = `/onboarding?next=${encodeURIComponent('/ripz/play')}${isValidReferralCode(ref) ? `&ref=${ref}` : ''}`;

  useEffect(() => { if (!loading && user) router.replace('/ripz/play'); }, [loading, user, router]);
  useEffect(() => {
    funnelHit('ripz');
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; setMuted(m); audio.muted = m; } catch { /* private mode */ }
    return () => audio.close();
  }, [audio]);
  useEffect(() => { if (revealed) { funnelHit('ripz_rip'); actions.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, [revealed]);

  function toggleMute() {
    const m = !muted; setMuted(m); audio.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  }
  function pick(p: RipzPackDef) {
    const next = rollChallenge(last.current, Math.random, p.moveId); last.current = next;
    setPack(p); setChallenge(next); setRevealed(false); setPackKey((k) => k + 1);
  }
  function again() { setPack(null); setChallenge(null); setRevealed(false); }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <p className="wf-readout text-[10px] font-bold text-accent">Free · no account</p>
          <h1 className="text-4xl font-black italic text-white">RIPZ</h1>
        </div>
        <button type="button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} className="p-2 rounded-xl border border-white/10 text-text-secondary hover:text-white">
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
      {friend && !pack ? (
        <p className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm font-bold text-white">
          Your friend pulled {friend.n} {friend.move.name.toLowerCase()}. <span className="text-accent">What do you get?</span>
        </p>
      ) : !pack && (
        <p className="text-sm text-text-secondary mt-2">Pick a pack. Rip it open. Do what it deals: {RIPZ_MIN} to {RIPZ_MAX} reps.</p>
      )}

      <div className={`mt-5 ${pack ? 'mb-16 min-h-[380px]' : 'mb-4'}`}>
        {pack && challenge
          ? <RipzPack pack={pack} challenge={challenge} audio={audio} packKey={packKey} onRevealed={() => setRevealed(true)} />
          : <RipzWheel audio={audio} onPick={pick} />}
      </div>

      {revealed && challenge && (
        <div ref={actions} className="space-y-2 wf-rise scroll-mb-10">
          <RipzShare challenge={challenge} />
          <Link href={joinHref} onClick={() => funnelHit('ripz_join')} className="block">
            <Button fullWidth>Save my reps. Start free <ChevronRight className="w-4 h-4" /></Button>
          </Link>
          <Button fullWidth variant="ghost" onClick={again}><RotateCcw className="w-4 h-4" /> Rip another pack</Button>
          <p className="text-center text-[11px] text-text-tertiary">An account keeps your packs, total reps and best pull, and gives you a full training program.</p>
        </div>
      )}

      {!pack && (
        <div className="space-y-3 mt-5">
          <RipzOdds />
          <Link href={joinHref} onClick={() => funnelHit('ripz_join')} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface p-3">
            <span className="flex-1">
              <span className="block text-sm font-black text-white">Ripz is one part of Warfare Fitness</span>
              <span className="block text-xs text-text-secondary">A program matched to you, every session written out. Two minutes to get yours.</span>
            </span>
            <ChevronRight className="w-4 h-4 text-accent" />
          </Link>
        </div>
      )}
    </div>
  );
}
