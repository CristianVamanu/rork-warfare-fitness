'use client';

/**
 * The pack. Drag a finger across it to tear the top off; it shakes and
 * crackles harder the further the tear gets, then gives with a rip and deals
 * the challenge. Letting go early springs it shut. Keyboard and screen-reader
 * users get a plain "Rip it open" button that does the same thing.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronsRight, ChevronLeft } from 'lucide-react';
import { RIPZ_TIERS, type RipzChallenge, type RipzPackDef } from '@/lib/ripz';
import { packVars, PackArt } from './RipzWheel';
import { RipzAudio, buzz } from './ripzAudio';

const OPEN_AT = 0.9;

export function RipzPack({ challenge, audio, packKey, onRevealed, pack, onBack }: {
  /** Back to the wheel while the pack is still sealed: a mis-tap costs nothing. */
  onBack?: () => void;
  /** Which coloured pack was picked off the wheel. */
  pack: RipzPackDef;
  challenge: RipzChallenge;
  audio: RipzAudio;
  /** Changes for every new pack, so state resets without a remount flash. */
  packKey: number;
  onRevealed: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'sealed' | 'opening' | 'revealed'>('sealed');
  const [shown, setShown] = useState(0);
  const [jitter, setJitter] = useState({ x: 0, y: 0, r: 0 });
  const drag = useRef<{ lastX: number; lastT: number; lastBuzz: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const tier = RIPZ_TIERS[challenge.tier];

  useEffect(() => {
    setProgress(0); progressRef.current = 0; setPhase('sealed'); setShown(0); setJitter({ x: 0, y: 0, r: 0 });
  }, [packKey]);

  const open = useCallback(() => {
    if (phase !== 'sealed') return;
    setPhase('opening'); setProgress(1); progressRef.current = 1; setJitter({ x: 0, y: 0, r: 0 });
    audio.dragEnd(); audio.rip(); buzz([30, 40, 90]);
    window.setTimeout(() => setPhase('revealed'), 420);
  }, [phase, audio]);

  // Count the number up once the card is out, ticking as it climbs.
  useEffect(() => {
    if (phase !== 'revealed') return;
    const total = challenge.count; const start = performance.now(); const dur = 650 + Math.min(total, 120) * 6;
    let raf = 0; let last = -1;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const n = Math.max(1, Math.round((1 - Math.pow(1 - k, 3)) * total));
      if (n !== last) { last = n; setShown(n); if (n % 2 === 0 || n === total) audio.tick(n / 200); }
      if (k < 1) raf = requestAnimationFrame(step);
      else { audio.sting(['rookie', 'soldier', 'veteran', 'elite', 'legend'].indexOf(challenge.tier)); buzz(challenge.tier === 'elite' || challenge.tier === 'legend' ? [40, 30, 40, 30, 120] : 60); onRevealed(); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function down(e: React.PointerEvent) {
    if (phase !== 'sealed') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { lastX: e.clientX, lastT: performance.now(), lastBuzz: 0 };
    audio.dragStart();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || phase !== 'sealed' || !box.current) return;
    const w = box.current.getBoundingClientRect().width || 1;
    const now = performance.now();
    const dx = Math.abs(e.clientX - d.lastX);
    const speed = Math.min(1, dx / Math.max(1, now - d.lastT) / 1.2);
    d.lastX = e.clientX; d.lastT = now;
    const p = Math.min(1, progressRef.current + dx / (w * 0.95));
    progressRef.current = p; setProgress(p);
    audio.dragMove(speed);
    const amp = 1 + p * 5;
    setJitter({ x: (Math.random() - 0.5) * amp, y: (Math.random() - 0.5) * amp, r: (Math.random() - 0.5) * amp * 0.6 });
    if (p - d.lastBuzz > 0.12) { d.lastBuzz = p; buzz(8); }
    if (p >= OPEN_AT) { drag.current = null; open(); }
  }
  function up() {
    if (!drag.current) return;
    drag.current = null; audio.dragEnd();
    if (phase === 'sealed') { progressRef.current = 0; setProgress(0); setJitter({ x: 0, y: 0, r: 0 }); }
  }

  const sealed = phase === 'sealed';
  return (
    <div className="relative mx-auto w-[240px] h-[380px] select-none">
      {/* The challenge card: sits behind the pack, rises out when it opens. */}
      <div
        className={`absolute inset-x-3 top-6 bottom-3 rounded-2xl border bg-surface flex flex-col items-center justify-center text-center px-3 transition-all duration-500 ${phase === 'revealed' ? 'opacity-100 scale-100 ripz-card-in' : 'opacity-0 scale-90'}`}
        style={{ borderColor: tier.color, boxShadow: phase === 'revealed' ? `0 0 46px ${tier.color}55, inset 0 0 30px ${tier.color}18` : 'none' }}
        aria-live="polite"
      >
        {phase === 'revealed' && (
          <>
            <p className="wf-readout text-[10px] font-bold" style={{ color: tier.color }}>{tier.label} pull</p>
            <p className="text-[92px] leading-none font-black text-white tabular-nums mt-2" style={{ textShadow: `0 0 28px ${tier.color}88` }}>{shown}</p>
            <p className="text-xl font-black text-white uppercase mt-2">{challenge.move.name}</p>
            <p className="text-xs text-text-secondary mt-2">Break them into sets if you need to. All of them count.</p>
          </>
        )}
      </div>

      {/* The pack itself. */}
      <div
        ref={box}
        role="img"
        aria-label="Sealed Ripz pack"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={`absolute inset-0 ${sealed ? (progress === 0 ? 'ripz-idle cursor-grab' : 'cursor-grabbing') : 'pointer-events-none'}`}
        style={{ ...packVars(pack), touchAction: 'none', transform: sealed && progress > 0 ? `translate(${jitter.x}px, ${jitter.y}px) rotate(${jitter.r}deg)` : undefined }}
      >
        {/* Torn-off top strip: the top slice of the same artwork */}
        <div
          className="absolute inset-x-0 top-0 h-[58px] overflow-hidden ripz-glow transition-all duration-500 ease-out"
          style={phase !== 'sealed'
            ? { transform: 'translate(70px, -150px) rotate(28deg)', opacity: 0 }
            : { transform: `rotate(${progress * 3}deg) translateY(${-progress * 6}px)`, transformOrigin: '100% 100%', transitionDuration: '0ms' }}
        >
          <PackArt pack={pack} w={240} />
        </div>
        {/* Body: the rest of it */}
        <div className={`absolute inset-x-0 top-[58px] bottom-0 overflow-hidden ripz-glow transition-all duration-500 ${phase === 'sealed' ? '' : 'translate-y-10 opacity-0 scale-95'}`}>
          <div className="absolute inset-x-0 -top-[58px]"><PackArt pack={pack} w={240} /></div>
        </div>
        {/* Tear line: fills behind the finger */}
        {sealed && (
          <div className="absolute inset-x-0 top-[54px] h-2" aria-hidden>
            <div className="absolute inset-x-2 top-[3px] border-t-2 border-dashed border-white/70" />
            <div className="absolute left-0 top-0 h-2 rounded-r-full bg-white shadow-[0_0_14px_4px_rgba(255,255,255,0.85)]" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {/* Flash as it gives */}
        {phase === 'opening' && <div className="absolute inset-0 rounded-xl bg-white ripz-flash" aria-hidden />}
      </div>

      {sealed && (
        <div className="absolute inset-x-0 -bottom-[92px] flex flex-col items-center gap-3">
          <p className="flex items-center gap-1 wf-readout text-[11px] font-bold text-accent ripz-hint">Swipe across to rip <ChevronsRight className="w-4 h-4" /></p>
          {onBack && (
            <button type="button" onClick={() => { audio.dragEnd(); onBack(); }} className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/15 text-sm font-semibold text-text-secondary hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Choose another pack
            </button>
          )}
          <button type="button" onClick={open} className="sr-only focus:not-sr-only focus:text-xs focus:text-white focus:underline">Rip it open</button>
        </div>
      )}
    </div>
  );
}
