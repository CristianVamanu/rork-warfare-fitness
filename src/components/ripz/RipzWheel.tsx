'use client';

/**
 * The wheel: six coloured packs standing in a ring. Drag sideways (or use
 * the arrows) to turn it; it settles with one pack facing you. The packs at
 * the back face away, so you see their dimmed backs through the ring. Tap
 * the pack in front to pick it.
 */
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RIPZ_PACKS, type RipzPackDef } from '@/lib/ripz';
import { RipzAudio, buzz } from './ripzAudio';

const STEP = 360 / RIPZ_PACKS.length;
const RADIUS = 190;

export function packVars(p: RipzPackDef): React.CSSProperties {
  return { ['--ripz-1' as string]: p.colors[0], ['--ripz-2' as string]: p.colors[1], ['--ripz-3' as string]: p.colors[2] };
}

// Zig-zag crimped ends, like a sealed foil booster: one polygon, in percent.
const TEETH = 16;
const ZIG = (() => {
  const top: string[] = []; const bottom: string[] = [];
  for (let i = 0; i <= TEETH * 2; i++) {
    const x = (i / (TEETH * 2)) * 100;
    top.push(`${x.toFixed(2)}% ${i % 2 ? 0 : 1.5}%`);
    bottom.push(`${(100 - x).toFixed(2)}% ${i % 2 ? 100 : 98.5}%`);
  }
  return `polygon(${[...top, ...bottom].join(',')})`;
})();

// Faceted foil: a fixed mosaic of light and dark triangles laid over the
// colour, so each pack catches the light like cut crystal. Deterministic
// (no Math.random) so the server and the browser draw the same thing.
const FACETS = (() => {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const cols = 5; const rows = 8; const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) { pts.push([]); for (let c = 0; c <= cols; c++) {
    const edge = r === 0 || r === rows || c === 0 || c === cols;
    pts[r].push([(c + (edge ? 0 : (rnd() - 0.5) * 0.7)) * (100 / cols), (r + (edge ? 0 : (rnd() - 0.5) * 0.7)) * (100 / rows)]);
  } }
  let out = '';
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    const v = rnd(); const fill = v > 0.5 ? '255,255,255' : '0,0,0'; const op = (Math.abs(v - 0.5) * 0.62).toFixed(2);
    out += `<polygon points='${a.map((n) => n.toFixed(1)).join(',')} ${b.map((n) => n.toFixed(1)).join(',')} ${c.map((n) => n.toFixed(1)).join(',')}' fill='rgba(${fill},${op})'/>`;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    tri(pts[r][c], pts[r][c + 1], pts[r + 1][c]); tri(pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]);
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${out}</svg>`)}")`;
})();

/**
 * The pack artwork, drawn at any size: `w` is the pack width in px and
 * everything inside is sized from it. Crimped ends, faceted foil, tall white
 * lettering and a glowing crosshair in the middle.
 */
export function PackArt({ pack, w, back }: { pack: RipzPackDef; w: number; back?: boolean }) {
  return (
    <div className="wf-dark absolute left-0 top-0" style={{ ...packVars(pack), width: w, height: w * 1.585, fontSize: w / 10, clipPath: ZIG, WebkitClipPath: ZIG }}>
      <div className="absolute inset-0 ripz-foil-base" />
      <div className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: FACETS, backgroundSize: '100% 100%' }} aria-hidden />
      {/* No moving sheen on the backs: six fewer animations on a slow phone. */}
      {!back && <div className="absolute inset-0 ripz-sheen" aria-hidden />}
      {/* crimped seals */}
      <div className="absolute inset-x-0 top-0 h-[8%] ripz-seal" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-[8%] ripz-seal" aria-hidden />
      {!back && (
        <>
          <p className="absolute left-[7%] top-[16.5%] text-[0.52em] font-bold tracking-wide text-white/95">WARFARE FITNESS</p>
          <p className="absolute right-[7%] top-[16.3%] text-[0.62em] font-black italic uppercase text-white">{pack.id}</p>
          <p className="absolute inset-x-0 top-[22.5%] text-center font-black text-white leading-none ripz-letters" style={{ fontSize: '3.55em' }}>RIPZ</p>
          <div className="absolute left-1/2 top-[52%] w-[44%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full ripz-emblem" aria-hidden>
            <span className="absolute inset-[26%] rounded-full ripz-emblem-core" />
            <span className="absolute left-1/2 top-[-6%] bottom-[-6%] w-[3%] -translate-x-1/2 bg-white/80 ripz-emblem-tick" />
            <span className="absolute top-1/2 left-[-6%] right-[-6%] h-[3%] -translate-y-1/2 bg-white/80 ripz-emblem-tick" />
          </div>
          <p className="absolute inset-x-[4%] bottom-[11%] text-center text-[0.6em] font-bold uppercase tracking-[0.12em] text-white">{pack.label} challenge pack</p>
        </>
      )}
      {back && <div className="absolute inset-0 bg-black/55" />}
    </div>
  );
}

/** A whole sealed pack, as it stands on the wheel. */
export function PackFace({ pack, back }: { pack: RipzPackDef; back?: boolean }) {
  return (
    <div className={`ripz-face ripz-glow ${back ? 'ripz-back' : ''}`} style={packVars(pack)}>
      <PackArt pack={pack} w={150} back={back} />
    </div>
  );
}

export function RipzWheel({ audio, onPick }: { audio: RipzAudio; onPick: (pack: RipzPackDef) => void }) {
  // Degrees the ring has turned. Negative turns it left, bringing the next pack forward.
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: number; lastIdx: number } | null>(null);

  const idxAt = (a: number) => ((Math.round(-a / STEP) % RIPZ_PACKS.length) + RIPZ_PACKS.length) % RIPZ_PACKS.length;
  const front = RIPZ_PACKS[idxAt(angle)];

  function turn(by: number) { setAngle((a) => Math.round(a / STEP) * STEP + by * STEP); audio.tick(0.3); buzz(8); }

  function down(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: angle, moved: 0, lastIdx: idxAt(angle) };
    setDragging(true);
    // Browsers only let sound start from a touch; wake it on the first one.
    audio.unlock();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x; d.moved = Math.max(d.moved, Math.abs(dx));
    const a = d.start + dx * 0.45; setAngle(a);
    const i = idxAt(a); if (i !== d.lastIdx) { d.lastIdx = i; audio.tick(0.3); buzz(8); }
  }
  function up() {
    const d = drag.current; if (!d) return;
    drag.current = null; setDragging(false);
    if (d.moved < 8) { audio.tick(0.8); buzz(15); onPick(RIPZ_PACKS[idxAt(angle)]); return; }
    setAngle((a) => Math.round(a / STEP) * STEP);
  }

  // The browser took the gesture (a vertical scroll that began on the wheel).
  // Settle the ring, and never treat it as a tap: that picked a pack by itself.
  function cancel() {
    if (!drag.current) return;
    drag.current = null; setDragging(false);
    setAngle((a) => Math.round(a / STEP) * STEP);
  }

  return (
    <div>
      <div
        className="ripz-stage relative mx-auto h-[300px] w-full max-w-[390px] overflow-hidden select-none cursor-grab"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        role="group" aria-label={`Pack wheel. ${front.label} pack in front.`}
      >
        <div
          className="ripz-ring absolute left-1/2 top-6 w-[150px] h-[238px] -ml-[75px]"
          style={{ transform: `translateZ(-${RADIUS}px) rotateY(${angle}deg)`, transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15)' }}
        >
          {RIPZ_PACKS.map((p, i) => (
            <div key={p.id} className="ripz-ring-item" style={{ transform: `rotateY(${i * STEP}deg) translateZ(${RADIUS}px)` }}>
              <PackFace pack={p} />
              <PackFace pack={p} back />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2">
        <button type="button" onClick={() => turn(1)} aria-label="Previous pack" className="p-2 rounded-xl border border-white/10 text-text-secondary hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
        <button type="button" onClick={() => { audio.tick(0.8); buzz(15); onPick(front); }} className="px-5 py-2.5 rounded-xl font-black text-sm text-black" style={{ background: front.colors[1] }}>
          Pick {front.label}
        </button>
        <button type="button" onClick={() => turn(-1)} aria-label="Next pack" className="p-2 rounded-xl border border-white/10 text-text-secondary hover:text-white"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <p className="text-center wf-readout text-[10px] font-bold text-text-tertiary mt-3">Swipe to spin · tap the front pack to pick it</p>
    </div>
  );
}
