'use client';

import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isEquipmentItem, equipmentLabel } from '@/lib/equipment';
import { dayNeeds, missingFor } from '@/lib/equipmentNeeds';
import type { Exercise } from '@/types';

/**
 * What the next session asks of you: the kit it needs and every exercise
 * with its sets and reps. Shared by the Training tab's active-program card
 * and the program page's Next Workout card, so the two never disagree about
 * the same session.
 *
 * Kit chips turn amber when the member's saved equipment lacks one; with no
 * equipment saved it never warns (see missingFor).
 */
export function SessionPreview({ exercises }: { exercises: readonly Exercise[] }) {
  const { profile } = useAuth();
  if (exercises.length === 0) return null;
  const needs = dayNeeds(exercises);
  const mine = Array.isArray(profile?.equipmentItems) ? (profile.equipmentItems as unknown[]).filter(isEquipmentItem) : [];
  const missing = missingFor(needs, mine);
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-tertiary mr-0.5">Kit</span>
        {needs.length === 0 && <span className="text-[11px] text-text-secondary">None, bodyweight session</span>}
        {needs.map((n) => (
          <span key={n} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${missing.includes(n) ? 'border-amber-400/50 text-amber-300 bg-amber-400/10' : 'border-white/10 text-text-secondary'}`}>
            {missing.includes(n) && <AlertTriangle className="w-3 h-3" />}{equipmentLabel(n)}
          </span>
        ))}
        {missing.length > 0 && <span className="text-[11px] text-amber-300/80">not in your equipment</span>}
      </div>
      <div className="mt-1 rounded-xl border border-white/8 bg-black/20 divide-y divide-white/6">
        {exercises.map((ex, i) => (
          <div key={ex.id ?? i} className="flex items-center gap-2.5 px-3 py-2 text-sm">
            <span className="w-5 text-[10px] font-black text-accent/80 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1 min-w-0 truncate text-text-secondary">{ex.name}</span>
            <span className="text-text-tertiary text-[11px] font-semibold tabular-nums">{ex.sets}×{ex.reps}</span>
          </div>
        ))}
      </div>
    </>
  );
}
