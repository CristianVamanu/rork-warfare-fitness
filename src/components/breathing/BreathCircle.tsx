'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * The breathing circle from the Reset reels, as a component.
 *
 * One glowing ring that grows on the inhale and shrinks on the exhale, a
 * thin dial of tick marks that turns very slowly, an outer arc that fills
 * over the whole session and an inner arc that fills over the current
 * breath, the cue word in the middle with a one-line hint under it, and a
 * small readout at each top corner. Everything is drawn from numbers the
 * page passes in, so the circle, the arcs and the words can never drift
 * apart: they are all views of the same clock.
 *
 * `size` is the ring's fill, 0..1, already eased by the caller. `tone`
 * swaps the gold for ice during a Wim Hof retention hold, which the old
 * screen did too and people have learned to read.
 */
export interface BreathCircleProps {
  size: number;
  word: string;
  hint?: string;
  /** 0..1 through the whole session. */
  sessionProgress: number;
  /** 0..1 through the current phase. */
  phaseProgress: number;
  topLeft?: string;
  topRight?: string;
  tone?: 'gold' | 'ice';
  /** Fades the whole instrument in and out; the page uses it at the ends. */
  visible?: number;
  /** Seconds elapsed, for the slow dial rotation and the drifting specks. */
  t: number;
  className?: string;
}

const CX = 300, CY = 300, R = 228;
const DIAL = 272, PHASE = 256;
const C_DIAL = 2 * Math.PI * DIAL, C_PHASE = 2 * Math.PI * PHASE;

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function BreathCircle({ size, word, hint, sessionProgress, phaseProgress, topLeft, topRight, tone = 'gold', visible = 1, t, className = '' }: BreathCircleProps) {
  const p = Math.max(0, Math.min(1, size));
  const r = R * p;
  const k = Math.max(0, Math.min(1, (p - 0.3) / 0.7)); // 0 at the bottom of a breath, 1 at the top
  const vis = Math.max(0, Math.min(1, visible));
  const gold = tone === 'ice';
  const line = gold ? '#BFE3FF' : '#FFD9A0';
  const glow = gold ? '#38BDF8' : '#F5A623';
  const glowRgb = gold ? '56,189,248' : '245,166,35';

  const ticks = useMemo(() => Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2; const L = i % 6 === 0;
    const r1 = 282, r2 = L ? 298 : 290;
    return { x1: CX + Math.cos(a) * r1, y1: CY + Math.sin(a) * r1, x2: CX + Math.cos(a) * r2, y2: CY + Math.sin(a) * r2, L };
  }), []);
  const specks = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: hash(i) * 600, y: hash(i + 40) * 600, s: 0.7 + hash(i + 80) * 1.3, v: 3 + hash(i + 120) * 6, ph: hash(i + 160) * 6.28 })), []);

  // Word changes fade rather than cut. We keep the last word on screen for
  // the fade-out by holding it in a ref.
  const lastWord = useRef(word);
  useEffect(() => { if (word) lastWord.current = word; }, [word]);
  const shownWord = word || lastWord.current;

  return (
    <div className={`relative w-full aspect-square ${className}`} style={{ opacity: vis }}>
      {/* soft halo behind the ring, breathing with it */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
        style={{
          width: `${(r * 3.2 / 600) * 100}%`, height: `${(r * 3.2 / 600) * 100}%`, transform: 'translate(-50%,-50%)',
          background: `radial-gradient(circle, rgba(${gold ? '191,227,255' : '255,200,130'},.30) 0%, rgba(${glowRgb},.10) 40%, transparent 70%)`,
          opacity: 0.25 + k * 0.6,
        }}
      />
      <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <radialGradient id="bc-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={glow} stopOpacity=".02" />
            <stop offset="75%" stopColor={glow} stopOpacity=".07" />
            <stop offset="100%" stopColor={glow} stopOpacity=".16" />
          </radialGradient>
          <filter id="bc-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12" /></filter>
        </defs>
        {/* drifting specks */}
        <g>
          {specks.map((d, i) => {
            const y = ((d.y - t * d.v) % 600 + 600) % 600; const x = d.x + Math.sin(t * 0.2 + d.ph) * 10;
            return <circle key={i} cx={x} cy={y} r={d.s} fill={line} opacity={(0.08 + 0.14 * k) * (0.5 + 0.5 * Math.sin(t * 0.4 + d.ph))} />;
          })}
        </g>
        {/* dial + ticks, turning once every ten minutes */}
        <g transform={`rotate(${t * 0.6} ${CX} ${CY})`} stroke={line} strokeLinecap="round" opacity={0.6 + 0.4 * k}>
          {ticks.map((tk, i) => <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} strokeWidth={tk.L ? 1.6 : 1} opacity={tk.L ? 0.35 : 0.18} />)}
        </g>
        <circle cx={CX} cy={CY} r={DIAL} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1" />
        {/* session arc, then the phase arc inside it */}
        <circle cx={CX} cy={CY} r={DIAL} fill="none" stroke={line} strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} strokeDasharray={`${C_DIAL * Math.max(0, Math.min(1, sessionProgress))} ${C_DIAL}`} />
        <circle cx={CX} cy={CY} r={PHASE} fill="none" stroke={glow} strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} strokeDasharray={`${C_PHASE * Math.max(0, Math.min(1, phaseProgress))} ${C_PHASE}`} />
        {/* the breath */}
        <circle cx={CX} cy={CY} r={r} fill="url(#bc-fill)" opacity={0.5 + k * 0.5} />
        <circle cx={CX} cy={CY} r={r} fill="none" stroke={glow} strokeWidth="14" filter="url(#bc-soft)" opacity={0.2 + k * 0.6} />
        <circle cx={CX} cy={CY} r={r} fill="none" stroke={line} strokeWidth="3" opacity={0.75 + k * 0.25} />
        <circle cx={CX} cy={CY} r={r * 0.86} fill="none" stroke={line} strokeOpacity=".18" strokeWidth="1" />
      </svg>
      {/* words */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
        <p
          className="font-medium tracking-[0.55em] pl-[0.55em] text-[clamp(18px,5.2vw,26px)] transition-opacity duration-500"
          style={{ color: gold ? 'rgba(220,240,255,.9)' : 'rgba(255,240,220,.88)', opacity: word ? 1 : 0 }}
        >
          {shownWord}
        </p>
        <p
          className="mt-3 font-medium tracking-[0.4em] pl-[0.4em] text-[clamp(10px,2.6vw,13px)] transition-opacity duration-500"
          style={{ color: gold ? 'rgba(191,227,255,.55)' : 'rgba(255,226,180,.55)', opacity: word && hint ? 1 : 0 }}
        >
          {hint}
        </p>
      </div>
      {/* readouts */}
      <div className="absolute inset-x-0 -top-2 flex items-center justify-between font-medium text-[11px] tracking-[0.34em] tabular-nums" style={{ color: 'rgba(255,226,180,.55)' }}>
        <span>{topLeft}</span><span>{topRight}</span>
      </div>
    </div>
  );
}
