'use client';

/**
 * Ghost race: you against your own best pace on this move.
 * Start → 3·2·1 → two lanes run: the ghost fills at your record pace, you tap
 * Finished when the last rep is done. Beat it and that pace becomes the ghost.
 */
import { useEffect, useRef, useState } from 'react';
import { Ghost, Play, Flag, RotateCcw, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RipzAudio, buzz } from './ripzAudio';
import { ghostSeconds, judgeRun, formatRace, type RipzGhost, type GhostVerdict } from '@/lib/ripzGhost';

type Phase = 'idle' | 'ready' | 'run' | 'done';

export function RipzGhostRace({ moveId, moveName, count, ghost, audio, color = '#F5A623', busy, onFinish, onLogOnly }: {
  moveId: string; moveName: string; count: number; ghost?: RipzGhost; audio: RipzAudio; color?: string; busy?: boolean;
  /** Called once the member taps "Log it" after a race. */
  onFinish: (seconds: number, verdict: GhostVerdict) => void;
  /** Log without racing. */
  onLogOnly: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [n, setN] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [verdict, setVerdict] = useState<GhostVerdict | null>(null);
  const start = useRef(0);
  const passed = useRef(false);
  const lock = useRef<{ release?: () => Promise<void> } | null>(null);
  const target = ghost ? ghostSeconds(ghost, count) : null;

  useEffect(() => { setPhase('idle'); setElapsed(0); setVerdict(null); }, [count, moveId]);

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'run') return;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request('screen').then((l) => { lock.current = l; }).catch(() => {});
    return () => { void lock.current?.release?.().catch(() => {}); lock.current = null; };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready') return;
    setN(3); audio.beep(); buzz(20);
    let k = 3;
    const t = setInterval(() => {
      k -= 1;
      if (k > 0) { setN(k); audio.beep(); buzz(20); }
      else { clearInterval(t); audio.beep(true); buzz([60, 40, 120]); start.current = Date.now(); passed.current = false; setElapsed(0); setPhase('run'); }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const e = (Date.now() - start.current) / 1000;
      setElapsed(e);
      // The ghost crossing the line: one low tick so you know without looking.
      if (target !== null && !passed.current && e >= target) { passed.current = true; audio.tick(0.2); buzz(40); }
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function finish() {
    const s = (Date.now() - start.current) / 1000;
    const v = judgeRun(ghost, moveId, count, s);
    setElapsed(s); setVerdict(v); setPhase('done');
    if (v.valid && v.beat !== false) { audio.sting(2); buzz([80, 50, 80, 50, 200]); } else buzz(60);
  }

  const ghostFrac = target ? Math.min(1, elapsed / target) : 0;
  const lane = (label: string, frac: number, c: string, right: string, faded = false) => (
    <div className={faded ? 'opacity-70' : ''}>
      <div className="flex justify-between text-[11px] font-bold mb-1">
        <span className="wf-readout" style={{ color: c }}>{label}</span>
        <span className="text-white tabular-nums">{right}</span>
      </div>
      <div className="h-3 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(frac * 100)}%`, background: c, boxShadow: `0 0 12px ${c}`, transition: 'width .1s linear' }} />
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border bg-surface p-4" style={{ borderColor: `${color}55` }}>
      <div className="flex items-center gap-2">
        <Ghost className="w-5 h-5" style={{ color }} />
        <p className="text-sm font-black text-white">Ghost race</p>
      </div>

      {phase === 'idle' && (
        <>
          <p className="text-xs text-text-secondary mt-1.5">
            {ghost && target !== null
              ? <>Your ghost does {count} {moveName.toLowerCase()} in <b className="text-white">{formatRace(target)}</b>, at your best pace ({ghost.pace.toFixed(2)}s a rep). Beat it.</>
              : <>No ghost yet for {moveName.toLowerCase()}. Race the clock and this run becomes your ghost.</>}
          </p>
          <div className="mt-3 space-y-2">
            <Button fullWidth onClick={() => { audio.unlock(); setPhase('ready'); }}><Play className="w-4 h-4" /> {ghost ? 'Race my ghost' : 'Set my ghost'}</Button>
            <Button fullWidth variant="ghost" onClick={onLogOnly} disabled={busy}><Check className="w-4 h-4" /> Just log it</Button>
          </div>
        </>
      )}

      {phase === 'ready' && (
        <div className="text-center py-4" aria-live="assertive">
          <p className="wf-readout text-[10px] font-bold" style={{ color }}>Get into position</p>
          <p key={n} className="text-6xl font-black text-white tabular-nums ripz-card-in">{n}</p>
        </div>
      )}

      {phase === 'run' && (
        <div className="mt-3 space-y-3">
          <p className="text-center text-5xl font-black text-white tabular-nums">{formatRace(elapsed)}</p>
          {target !== null && lane('Ghost', ghostFrac, '#A9B1C2', ghostFrac >= 1 ? 'Finished' : formatRace(target), true)}
          <p className="text-center text-[11px] text-text-tertiary">{target !== null && ghostFrac >= 1 ? 'Your ghost is done. Finish strong.' : `Do all ${count}, then tap Finished.`}</p>
          <Button fullWidth onClick={finish}><Flag className="w-4 h-4" /> Finished</Button>
        </div>
      )}

      {phase === 'done' && verdict && (
        <div className="mt-3 space-y-3 text-center">
          <p className="text-4xl font-black text-white tabular-nums">{formatRace(elapsed)}</p>
          <p className="text-sm font-bold" style={{ color: verdict.valid && verdict.beat !== false ? color : '#C9C9CF' }}>
            {!verdict.valid ? 'That was faster than anyone can move. Not counted as a record.'
              : verdict.beat === null ? 'Ghost set. Next time, it races you.'
              : verdict.beat ? `You beat your ghost by ${verdict.margin.toFixed(1)}s. New ghost saved.`
              : `Your ghost wins by ${Math.abs(verdict.margin).toFixed(1)}s. Get it next time.`}
          </p>
          <Button fullWidth onClick={() => onFinish(elapsed, verdict)} disabled={busy}><Check className="w-4 h-4" /> Log it</Button>
          <Button fullWidth variant="ghost" onClick={() => { setPhase('idle'); setVerdict(null); setElapsed(0); }}><RotateCcw className="w-4 h-4" /> Race again</Button>
        </div>
      )}
    </div>
  );
}
