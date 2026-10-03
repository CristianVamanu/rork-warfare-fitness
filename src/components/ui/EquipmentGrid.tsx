'use client';

import { CheckCircle } from 'lucide-react';
import { EQUIPMENT_ITEMS, type EquipmentItem } from '@/lib/equipment';

/**
 * The ten-item equipment picker: used by the quiz and by the profile's
 * equipment editor, so both look and behave the same. Multi-select;
 * the caller applies the "bodyweight only is exclusive" rule through
 * toggleEquipment so the rule lives in one place.
 */
export function EquipmentGrid({ selected, onToggle, compact = false }: { selected: readonly EquipmentItem[]; onToggle: (v: EquipmentItem) => void; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}>
      {EQUIPMENT_ITEMS.map(({ id, label }) => {
        const on = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={on}
            className={`text-left rounded-2xl border overflow-hidden transition-all ${on ? 'border-accent shadow-[0_0_0_1px_rgba(245,166,35,0.25)]' : 'border-white/8 hover:border-white/20'}`}
            style={{ backgroundColor: 'var(--card-glass-bg)' }}
          >
            <div className={`${compact ? 'aspect-[4/3] p-3' : 'aspect-square p-5'} flex items-center justify-center`} style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 55%, rgba(var(--accent-rgb) / 0.10), transparent 75%)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/equipment/${id}.webp`} alt="" className="max-w-full max-h-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]" loading="lazy" />
            </div>
            <div className={`flex items-center justify-between gap-2 border-t border-white/8 ${compact ? 'px-3 py-2' : 'px-3.5 py-3'}`}>
              <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-white leading-tight`}>{label}</span>
              <span className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-accent border-accent' : 'border-white/30'}`}>
                {on && <CheckCircle className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-black`} strokeWidth={3} />}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
