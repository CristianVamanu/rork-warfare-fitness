'use client';

/**
 * The wheel: six coloured packs standing in a ring. Drag sideways (or use
 * the arrows) to turn it; it settles with one pack facing you. The packs at
 * the back face away, so you see their dimmed backs through the ring. Tap
 * the pack in front to pick it.
 */
import { useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RIPZ_PACKS, type RipzPackDef } from '@/lib/ripz';
import { RipzAudio, buzz } from './ripzAudio';

const STEP = 360 / RIPZ_PACKS.length;
const RADIUS = 190;

export function packVars(p: RipzPackDef): React.CSSProperties {
  return { ['--ripz-1' as string]: p.colors[0], ['--ripz-2' as string]: p.colors[1], ['--ripz-3' as string]: p.colors[2] };
}

/** A whole sealed pack, as it stands on the wheel. */
export function PackFace({ pack, back }: { pack: RipzPackDef; back?: boolean }) {
  return (
    <div className={`ripz-face ripz-foil ripz-crimp-top ripz-crimp-bottom rounded-xl overflow-hidden ${back ? 'ripz-back' : ''}`} style={packVars(pack)}>
      {!back && (
        <>
          <div className="absolute inset-x-0 top-3 flex justify-center">
            <Image src="/brand/logo-wf.webp" alt="" width={230} height={39} className="w-[78px] h-auto opacity-90" />
          </div>
          <p className="absolute inset-x-0 top-[62px] text-center text-[46px] leading-none font-black italic tracking-tight text-black/85 ripz-word">RIPZ</p>
          <p className="absolute inset-x-1 bottom-4 text-center wf-readout text-[9px] font-bold text-black/85">{pack.label}</p>
        </>
      )}
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

  return (
    <div>
      <div
        className="ripz-stage relative mx-auto h-[300px] w-full max-w-[390px] overflow-hidden select-none cursor-grab"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
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
