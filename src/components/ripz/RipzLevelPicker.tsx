'use client';

import { useEffect, useState } from 'react';
import { RIPZ_LEVELS, isRipzLevel, levelRange, type RipzLevel } from '@/lib/ripz';

const LEVEL_KEY = 'wf.ripz.level';

/** The member's Ripz level, remembered in this browser. Beginner by default,
 *  so nobody's first pack is a wall of 150 push-ups. */
export function useRipzLevel(): [RipzLevel, (l: RipzLevel) => void] {
  const [level, setLevel] = useState<RipzLevel>('beginner');
  useEffect(() => { try { const v = localStorage.getItem(LEVEL_KEY); if (isRipzLevel(v)) setLevel(v); } catch { /* private mode */ } }, []);
  const set = (l: RipzLevel) => { setLevel(l); try { localStorage.setItem(LEVEL_KEY, l); } catch { /* private mode */ } };
  return [level, set];
}

export function RipzLevelPicker({ level, onChange }: { level: RipzLevel; onChange: (l: RipzLevel) => void }) {
  const [lo, hi] = levelRange(level);
  return (
    <div className="mt-4">
      <p className="text-xs font-bold text-white mb-2">Your level</p>
      <div role="radiogroup" aria-label="Your level" className="grid grid-cols-3 gap-2">
        {RIPZ_LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            onClick={() => onChange(l.id)}
            className={`h-10 rounded-full border text-sm font-semibold transition-colors ${level === l.id ? 'border-accent bg-accent/10 text-white shadow-[0_0_16px_-4px_rgba(255,140,0,.7)]' : 'border-white/12 text-text-secondary hover:text-white'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-tertiary mt-2">Packs deal {lo} to {hi} reps at this level.</p>
    </div>
  );
}
