'use client';

/**
 * The wheel: six coloured packs standing in a ring. Drag sideways (or use
 * the arrows) to turn it; it settles with one pack facing you. The packs at
 * the back face away, so you see their dimmed backs through the ring. Tap
 * the pack in front to pick it.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RIPZ_PACKS, type RipzPackDef } from '@/lib/ripz';
import { RipzAudio, buzz } from './ripzAudio';

const STEP = 360 / RIPZ_PACKS.length;
const RADIUS = 190;

export function packVars(p: RipzPackDef): React.CSSProperties {
  return { ['--ripz-1' as string]: p.colors[0], ['--ripz-2' as string]: p.colors[1], ['--ripz-3' as string]: p.colors[2] };
}

/** Where a pack's rendered artwork lives. `small` is the half-size copy the wheel uses. */
export function packImage(pack: RipzPackDef, opts: { back?: boolean; small?: boolean } = {}): string {
  return `/ripz/${pack.id}${opts.back ? '_back' : opts.small ? '_sm' : ''}.webp`;
}

/**
 * The pack artwork at any size: `w` is the pack width in px.
 *
 * The packs are 3D renders (a crinkled foil pouch with crimped, zig-zag
 * ends, the print laid on the foil), one image per colour with a
 * transparent background, plus a plain foil back for the far side of the
 * wheel. They were drawn in CSS before, which read as a flat illustration;
 * real foil needs real light. A moving sheen is laid over the front, masked
 * to the pack's own shape.
 */
export function PackArt({ pack, w, back }: { pack: RipzPackDef; w: number; back?: boolean }) {
  const src = packImage(pack, { back, small: w <= 200 });
  return (
    <div className="absolute left-0 top-0" style={{ width: w, height: w * 1.585 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full select-none" style={back ? { filter: 'brightness(0.5)' } : undefined} />
      {!back && (
        <div
          className="absolute inset-0 ripz-sheen" aria-hidden
          style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }}
        />
      )}
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
  // The rip screen uses the full-size render; fetch it while the pack is in front.
  useEffect(() => { const im = new Image(); im.src = packImage(front); }, [front]);

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
