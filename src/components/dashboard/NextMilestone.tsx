'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { pickNextMilestone } from '@/lib/nextMilestone';

/**
 * One line, one bar: the single closest thing this member is to earning.
 *
 * Everything shown is derived from `profile`, which the dashboard already has
 * loaded from AuthContext, so this adds no Firestore reads. The selection
 * rules (and why it's one item rather than a list) live in lib/nextMilestone.
 */
export function NextMilestone() {
  const { profile } = useAuth();
  if (!profile) return null;

  const shown = pickNextMilestone({
    totalWorkouts: profile.statsCache?.totalWorkouts ?? profile.stats?.totalWorkouts ?? 0,
    streak: profile.statsCache?.streak ?? profile.stats?.streak ?? 0,
    powerLevel: profile.powerLevel ?? 0,
    totalWeightLifted: profile.stats?.totalWeightLifted ?? 0,
    totalMealsLogged: profile.stats?.totalMealsLogged ?? 0,
    xp: profile.xp ?? 0,
    earnedAchievements: profile.achievements ?? [],
    completedQuests: profile.questsCompleted ?? [],
  });

  const pct = Math.round(Math.min(1, Math.max(0, shown.progress)) * 100);

  return (
    <Link
      href={shown.href}
      className="block group"
      aria-label={`Next milestone: ${shown.title}, ${pct}% complete`}
    >
      <div className="rounded-2xl bg-surface border border-border px-4 py-3 transition-colors group-hover:border-accent/40">
        <div className="flex items-center gap-3">
          <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">{shown.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-bold text-foreground truncate">{shown.title}</p>
              <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0 ml-auto">{pct}%</span>
            </div>
            <p className="text-xs text-text-secondary truncate">{shown.detail}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
