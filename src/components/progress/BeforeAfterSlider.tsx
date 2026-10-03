'use client';

import { useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

// Classic drag-to-reveal comparison — the "after" photo sits as the full
// base layer, the "before" photo is clipped to the slider position on top
// of it, and a plain <input type="range"> (made invisible, stretched to
// cover the whole frame) drives the position. Using a real range input
// instead of hand-rolled pointer/touch math gets correct drag behavior on
// both mouse and touch for free, including keyboard arrow-key support.
export function BeforeAfterSlider({ beforeUrl, afterUrl, beforeLabel = 'Before', afterLabel = 'After' }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50);

  return (
    <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden select-none bg-surface-elevated">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt={afterLabel} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeUrl} alt={beforeLabel} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white/90 shadow-[0_0_4px_rgba(0,0,0,0.5)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ChevronsLeftRight className="w-4 h-4 text-black" />
        </div>
      </div>

      <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">{beforeLabel}</span>
      <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">{afterLabel}</span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Drag to compare before and after photos"
        className="absolute inset-0 w-full h-full m-0 opacity-0 cursor-ew-resize appearance-none"
      />
    </div>
  );
}
