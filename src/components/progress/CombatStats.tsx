'use client';

import { Dumbbell, HeartPulse, Shield, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { combatStats, type StatWorkout, type CombatStat } from '@/lib/combatStats';

/**
 * Three stats, 0 to 100, from the last four weeks of logged training. They
 * climb when the member trains and fade when they stop (see lib/combatStats).
 * The card says in words what is happening, so it reads as a status, not a
 * chart: "Fading: 6 days since your last session."
 */
export function CombatStatsCard({ workouts, daysPerWeek }: { workouts: StatWorkout[]; daysPerWeek?: number }) {
  const s = combatStats(workouts, Date.now(), daysPerWeek || 4);
  const rows: { key: string; label: string; hint: string; icon: typeof Dumbbell; stat: CombatStat }[] = [
    { key: 'strength', label: 'Strength', hint: 'Sets lifted', icon: Dumbbell, stat: s.strength },
    { key: 'cardio', label: 'Cardio', hint: 'Minutes of cardio', icon: HeartPulse, stat: s.cardio },
    { key: 'discipline', label: 'Discipline', hint: 'Days you showed up', icon: Shield, stat: s.discipline },
  ];
  const status = s.daysSinceLast === null
    ? 'Log a workout to start building your stats.'
    : s.fading
      ? `Fading. ${s.daysSinceLast === 0 ? 'Trained today, but older sessions are dropping off.' : `${s.daysSinceLast} day${s.daysSinceLast === 1 ? '' : 's'} since your last session.`} Train to hold them.`
      : s.daysSinceLast === 0 ? 'Trained today. Stats are climbing.' : 'Holding. Train to push them up.';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-text-secondary uppercase tracking-wider">Combat stats</p>
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Last 4 weeks</p>
      </div>
      <p className={`text-xs mb-4 ${s.fading ? 'text-orange-400' : 'text-text-tertiary'}`}>{status}</p>
      <div className="space-y-4">
        {rows.map(({ key, label, hint, icon: Icon, stat }) => {
          const Arrow = stat.change > 0 ? ArrowUp : stat.change < 0 ? ArrowDown : Minus;
          const tone = stat.change > 0 ? 'text-success' : stat.change < 0 ? 'text-orange-400' : 'text-text-tertiary';
          return (
            <div key={key}>
              <div className="flex items-end justify-between mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-accent" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground leading-tight">{label}</p>
                    <p className="text-[10px] text-text-tertiary leading-tight">{hint}</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 flex-shrink-0">
                  <span className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${tone}`} aria-label={`${stat.change > 0 ? 'Up' : stat.change < 0 ? 'Down' : 'No change'} ${Math.abs(stat.change)} this week`}>
                    <Arrow className="w-3 h-3" />{stat.change !== 0 && Math.abs(stat.change)}
                  </span>
                  <span className="text-2xl font-black italic text-foreground tabular-nums leading-none">{stat.value}</span>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--progress-track)' }}
                role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stat.value} aria-label={label}>
                <div className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${stat.value}%`, background: 'linear-gradient(90deg, #C9760A, #F5A623)', boxShadow: stat.value > 0 ? '0 0 10px rgba(245,166,35,0.45)' : undefined }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
