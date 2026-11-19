import { RIPZ_TIERS, RIPZ_MAX, type RipzTier } from '@/lib/ripz';

/** What each tier can deal and how often. Shared by the member and public pages. */
export function RipzOdds() {
  const tiers = Object.keys(RIPZ_TIERS) as RipzTier[];
  const top = Math.max(...tiers.map((t) => RIPZ_TIERS[t].chance));
  return (
    <div className="rounded-2xl border border-white/8 bg-surface p-3">
      <p className="wf-readout text-[10px] font-bold text-text-tertiary mb-2">What a pack can deal</p>
      <div className="space-y-1.5">
        {tiers.map((t, i) => {
          const tier = RIPZ_TIERS[t]; const next = tiers[i + 1]; const max = next ? RIPZ_TIERS[next].min - 5 : RIPZ_MAX;
          return (
            <div key={t} className="flex items-center gap-2 text-xs">
              <span className="w-16 font-bold" style={{ color: tier.color }}>{tier.label}</span>
              <span className="w-24 whitespace-nowrap text-text-secondary tabular-nums">{tier.min}–{max} reps</span>
              <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(tier.chance / top) * 100}%`, background: tier.color }} /></span>
              <span className="w-9 text-right text-text-tertiary tabular-nums">{Math.round(tier.chance * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
