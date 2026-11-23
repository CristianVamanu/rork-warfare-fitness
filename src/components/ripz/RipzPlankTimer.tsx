'use client';

/**
 * The plank timer. Nothing runs until the member taps Start, so they can get
 * down on the floor first. Then "Get ready… 3 · 2 · 1 · GO", a beep on each,
 * and the hold counts down in a ring. Finishing reports the full time;
 * "I dropped" reports the seconds actually held. The screen is kept awake
 * while it runs so the phone does not lock mid-plank.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RipzAudio, buzz } from './ripzAudio';

type Phase = 'idle' | 'ready' | 'run' | 'done';

export function RipzPlankTimer({ seconds, audio, onDone, color = '#14B8A6', doneLabel = 'Done. Log it', busy }: {
  seconds: number; audio: RipzAudio; color?: string; doneLabel?: string; busy?: boolean;
  /** Seconds actually held (the full time, or less if they dropped). Omit for a timer with nothing to log. */
  onDone?: (held: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [n, setN] = useState(3);          // get-ready count
  const [left, setLeft] = useState(seconds);
  const [held, setHeld] = useState(0);
  const end = useRef(0);
  const lock = useRef<{ release?: () => Promise<void> } | null>(null);

  useEffect(() => { setPhase('idle'); setLeft(seconds); setHeld(0); }, [seconds]);

  // Keep the screen on while counting.
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'run') return;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen').then((l) => { lock.current = l; }).catch(() => {});
    return () => { void lock.current?.release?.().catch(() => {}); lock.current = null; };
  }, [phase]);

  // Get ready: 3, 2, 1, GO.
  useEffect(() => {
    if (phase !== 'ready') return;
    setN(3); audio.beep(); buzz(20);
    let k = 3;
    const t = setInterval(() => {
      k -= 1;
      if (k > 0) { setN(k); audio.beep(); buzz(20); }
      else { clearInterval(t); audio.beep(true); buzz([60, 40, 120]); end.current = Date.now() + seconds * 1000; setLeft(seconds); setPhase('run'); }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // The hold. Driven by the clock, so a throttled tab still ends on time.
  useEffect(() => {
    if (phase !== 'run') return;
    let last = seconds;
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      if (rem !== last) { last = rem; setLeft(rem); if (rem > 0 && rem <= 3) { audio.beep(); buzz(20); } }
      if (rem <= 0) { clearInterval(t); audio.beep(true); buzz([80, 50, 80, 50, 200]); setHeld(seconds); setPhase('done'); }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function dropped() {
    const h = Math.max(0, Math.min(seconds, seconds - Math.ceil((end.current - Date.now()) / 1000)));
    setHeld(h); setPhase('done');
  }

  const R = 54, C = 2 * Math.PI * R;
  const frac = phase === 'run' ? left / seconds : phase === 'done' ? 0 : 1;
  return (
    <div className="rounded-2xl border bg-surface p-4 text-center" style={{ borderColor: `${color}66` }}>
      <div className="relative mx-auto w-[150px] h-[150px]">
        <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90" aria-hidden>
          <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(128,128,128,0.2)" strokeWidth="9" />
          <circle cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} style={{ transition: 'stroke-dasharray .25s linear', filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="assertive">
          {phase === 'idle' && <><span className="text-4xl font-black text-white tabular-nums">{seconds}</span><span className="wf-readout text-[9px] font-bold text-text-tertiary">seconds</span></>}
          {phase === 'ready' && <><span className="wf-readout text-[9px] font-bold" style={{ color }}>Get ready</span><span key={n} className="text-6xl font-black text-white tabular-nums ripz-card-in">{n}</span></>}
          {phase === 'run' && <><span className="text-5xl font-black text-white tabular-nums">{left}</span><span className="wf-readout text-[9px] font-bold" style={{ color }}>Hold</span></>}
          {phase === 'done' && <><Check className="w-9 h-9" style={{ color }} strokeWidth={3} /><span className="text-xl font-black text-white tabular-nums">{held}s</span></>}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {phase === 'idle' && (
          <>
            <Button fullWidth onClick={() => { audio.unlock(); setPhase('ready'); }}><Play className="w-4 h-4" /> Start the timer</Button>
            <p className="text-[11px] text-text-tertiary">Get into position first. You get a 3-second countdown.</p>
          </>
        )}
        {phase === 'ready' && <p className="text-sm font-bold text-white">Get into your plank…</p>}
        {phase === 'run' && <Button fullWidth variant="ghost" onClick={dropped}>I dropped</Button>}
        {phase === 'done' && (
          <>
            <p className="text-sm font-bold text-white">{held >= seconds ? 'Held the full time. Strong.' : `You held ${held} of ${seconds} seconds. It still counts.`}</p>
            {onDone && held > 0 && <Button fullWidth onClick={() => onDone(held)} disabled={busy}><Check className="w-4 h-4" /> {doneLabel}</Button>}
            <Button fullWidth variant="ghost" onClick={() => { setPhase('idle'); setLeft(seconds); }}>Go again</Button>
          </>
        )}
      </div>
    </div>
  );
}
