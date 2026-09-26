'use client';

import { AlertTriangle, ArrowLeftRight, Check } from 'lucide-react';
import { equipmentLabel, type EquipmentItem } from '@/lib/equipment';
import { missingFor, type KitMode } from '@/lib/equipmentNeeds';

/**
 * "Needs: barbell · bench" under an exercise. Anything the member does not
 * own is amber, with a one-tap swap to the closest movement they can do.
 * Unknown equipment (empty `owned`) shows the needs in grey and no swap:
 * we do not nag someone who never told us what they have.
 */
export function KitNeeds({ needs, owned, swap, onSwap, swappedFrom }: {
  needs: readonly EquipmentItem[];
  owned: readonly EquipmentItem[];
  swap: { name: string } | null;
  onSwap?: () => void;
  swappedFrom?: string;
}) {
  const missing = missingFor(needs, owned);
  if (swappedFrom) {
    return (
      <p className="text-[11px] text-emerald-300 mt-1 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Swapped in for {swappedFrom}</p>
    );
  }
  if (needs.length === 0) return <p className="text-[11px] text-text-tertiary mt-1">No equipment needed</p>;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary mr-0.5">Needs</span>
      {needs.map((n) => {
        const lack = missing.includes(n);
        return (
          <span key={n} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${lack ? 'border-amber-400/50 text-amber-300 bg-amber-400/10' : 'border-white/10 text-text-secondary'}`}>
            {lack && <AlertTriangle className="w-3 h-3" />}{equipmentLabel(n)}
          </span>
        );
      })}
      {missing.length > 0 && swap && onSwap && (
        <button onClick={onSwap} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-accent text-black">
          <ArrowLeftRight className="w-3 h-3" /> Swap for {swap.name}
        </button>
      )}
      {missing.length > 0 && !swap && (
        <span className="text-[11px] text-amber-300/80">you don&apos;t have this</span>
      )}
    </div>
  );
}

/** "Where are you today?" for the session: my kit, a full gym, or nothing. */
export function KitModeSwitch({ mode, onChange, hasOwnKit }: { mode: KitMode; onChange: (m: KitMode) => void; hasOwnKit: boolean }) {
  const opts: { id: KitMode; label: string }[] = [
    { id: 'mine', label: hasOwnKit ? 'My kit' : 'Not set' },
    { id: 'gym', label: 'Full gym' },
    { id: 'bodyweight', label: 'No kit' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary whitespace-nowrap">Today I have</span>
      <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
        {opts.map((o) => (
          <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={mode === o.id} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${mode === o.id ? 'bg-accent text-black' : 'text-text-secondary hover:text-white'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
