'use client';

/**
 * "Your week" on Home: the weekly coach report (/api/ai/weekly-report).
 * Shows the headline and key numbers, expands to wins, the one fix and
 * next week's targets. Hidden for a week with nothing logged, and once the
 * member closes it for that week.
 */
import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { ClipboardList, ChevronDown, X, Check, Wrench, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { dayKey } from '@/lib/healthTrends';
import type { WeeklyReport } from '@/lib/weeklyReport';

const HIDE_KEY = 'wf-weekly-report-hidden';
// One fetch per week per session: the report for a past week never changes.
let cache: { key: string; report: WeeklyReport | null } | null = null;

export function WeeklyReportCard() {
  const { user, profile } = useAuth();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const key = `${user.uid}:${dayKey(new Date())}`;
    const show = (r: WeeklyReport | null) => {
      if (!alive || !r) return;
      try { if (localStorage.getItem(HIDE_KEY) === r.week) setHidden(true); } catch { /* storage blocked */ }
      setReport(r);
    };
    if (cache?.key === key) { show(cache.report); return () => { alive = false; }; }
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch(`/api/ai/weekly-report?today=${dayKey(new Date())}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json() as { report: WeeklyReport | null };
        cache = { key, report: json.report };
        show(json.report);
      } catch { /* no card */ }
    })();
    return () => { alive = false; };
  }, [user]);

  if (!report || hidden) return null;
  const s = report.stats;
  const lbs = profile?.weightUnit === 'lbs';
  const vol = lbs ? Math.round(s.volumeKg * 2.20462) : s.volumeKg;
  const unit = lbs ? 'lb' : 'kg';
  const weekLabel = new Date(`${report.week}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`;
  const goal = (v: number | null | undefined, g: number | null | undefined, u: string) => (v == null ? null : g ? `of ${g.toLocaleString()} ${u}` : null);
  // Everything the week has, as swipeable tiles. A tile only shows when
  // there is a number for it.
  const tiles = ([
    { label: 'Workouts', value: String(s.workouts), sub: s.prevWorkouts ? `${s.prevWorkouts} the week before` : null },
    { label: 'Sets', value: String(s.sets), sub: null },
    s.minutes ? { label: 'Minutes', value: String(s.minutes), sub: 'training time' } : null,
    vol > 0 ? { label: `Lifted (${unit})`, value: vol >= 10000 ? `${(vol / 1000).toFixed(1)}k` : vol.toLocaleString(), sub: null } : null,
    s.avgKcal != null ? { label: 'Calories / day', value: s.avgKcal.toLocaleString(), sub: goal(s.avgKcal, s.kcalGoal, 'kcal') } : null,
    s.avgProtein != null ? { label: 'Protein / day', value: `${s.avgProtein} g`, sub: goal(s.avgProtein, s.proteinGoal, 'g') } : null,
    s.avgCarbs != null ? { label: 'Carbs / day', value: `${s.avgCarbs} g`, sub: null } : null,
    s.avgFat != null ? { label: 'Fat / day', value: `${s.avgFat} g`, sub: null } : null,
    s.mealDays ? { label: 'Food logged', value: `${s.mealDays}/7`, sub: 'days' } : null,
    s.weightStartKg != null && s.weightEndKg != null ? { label: `Weight (${unit})`, value: (() => { const d = (s.weightEndKg! - s.weightStartKg!) * (lbs ? 2.20462 : 1); return `${d > 0 ? '+' : ''}${d.toFixed(1)}`; })(), sub: 'change' } : null,
    s.avgSleepMin != null ? { label: 'Sleep / night', value: hm(s.avgSleepMin), sub: null } : null,
    s.avgSteps != null ? { label: 'Steps / day', value: s.avgSteps.toLocaleString(), sub: null } : null,
    s.avgRestingHr != null ? { label: 'Resting HR', value: `${s.avgRestingHr}`, sub: 'bpm' } : null,
    s.streak ? { label: 'Streak', value: `${s.streak}d`, sub: null } : null,
  ] as ({ label: string; value: string; sub: string | null } | null)[]).filter((t): t is { label: string; value: string; sub: string | null } => !!t);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5 text-accent" />
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Coach report · week of {weekLabel}</span>
        </div>
        <button aria-label="Hide this week's report" onClick={() => { setHidden(true); try { localStorage.setItem(HIDE_KEY, report.week); } catch { /* storage blocked */ } }} className="text-text-tertiary hover:text-white -mt-1 -mr-1 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-lg font-black text-white leading-snug mt-1.5">{report.headline}</p>

      {/* Swipe sideways for more. Snap so a tile never stops half shown. */}
      <div className="-mx-4 mt-3 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="This week in numbers">
        <div className="flex gap-2 px-4 w-max">
          {tiles.map((t) => (
            <div key={t.label} className="snap-start rounded-xl bg-surface-elevated px-3 py-2.5 w-[104px] flex-shrink-0">
              <p className="text-lg font-black text-white tabular-nums truncate">{t.value}</p>
              <p className="text-[11px] text-text-secondary truncate">{t.label}</p>
              {t.sub && <p className="text-[10px] text-text-tertiary truncate">{t.sub}</p>}
            </div>
          ))}
        </div>
      </div>
      {tiles.length > 3 && <p className="text-[10px] text-text-tertiary mt-1.5">Swipe for more →</p>}

      {open && (
        <div className="mt-4 space-y-3.5">
          <div>
            <p className="text-[10px] font-bold text-success uppercase tracking-wide mb-1.5">What went well</p>
            <ul className="space-y-1.5">
              {report.wins.map((w, i) => <li key={i} className="flex gap-2 text-sm text-white leading-snug"><Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />{w}</li>)}
            </ul>
          </div>
          <div className="rounded-xl p-3 bg-accent-muted">
            <p className="text-[10px] font-bold text-accent uppercase tracking-wide mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> One thing to fix</p>
            <p className="text-sm text-white leading-snug">{report.fix}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide mb-1.5">Targets this week</p>
            <ul className="space-y-1.5">
              {report.targets.map((t, i) => <li key={i} className="flex gap-2 text-sm text-white"><Target className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </div>
          {report.generatedBy === 'ai' && <p className="text-[11px] text-text-tertiary">Written by AI from your logged numbers. It can be wrong; your coach and your body know best.</p>}
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-bold text-accent py-1.5">
        {open ? 'Show less' : 'Wins, one fix and this week’s targets'}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </Card>
  );
}
