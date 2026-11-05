'use client';

/**
 * "Your week" on Home: the weekly coach report (/api/ai/weekly-report).
 * Shows the headline and key numbers, expands to wins, the one fix and
 * next week's targets. Hidden for a week with nothing logged, and once the
 * member closes it for that week.
 */
import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { ClipboardList, ChevronDown, X, Check, Wrench, Target, Dumbbell, Layers, Timer, Weight, Flame, Beef, Wheat, Droplet, Utensils, Scale, Moon, Footprints, HeartPulse, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { dayKey } from '@/lib/healthTrends';
import { weekScore, type WeeklyReport } from '@/lib/weeklyReport';
import { ScoreRadar, NutritionRing } from './CoachVisuals';

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
  type Tile = { label: string; value: string; sub: string | null; icon: LucideIcon; color: string; pct?: number | null };
  const pct = (v: number | null | undefined, g: number | null | undefined) => (v != null && g ? Math.min(100, Math.round((v / g) * 100)) : null);
  const tiles = ([
    { label: 'Workouts', value: String(s.workouts), sub: s.prevWorkouts ? `${s.prevWorkouts} the week before` : null, icon: Dumbbell, color: '#F5A623' },
    { label: 'Sets done', value: String(s.sets), sub: null, icon: Layers, color: '#F5A623' },
    s.minutes ? { label: 'Training time', value: s.minutes >= 60 ? hm(s.minutes) : `${s.minutes} min`, sub: null, icon: Timer, color: '#60A5FA' } : null,
    vol > 0 ? { label: `Weight lifted`, value: `${vol >= 10000 ? `${(vol / 1000).toFixed(1)}k` : vol.toLocaleString()} ${unit}`, sub: null, icon: Weight, color: '#F5A623' } : null,
    s.avgKcal != null ? { label: 'Calories / day', value: s.avgKcal.toLocaleString(), sub: goal(s.avgKcal, s.kcalGoal, 'kcal'), icon: Flame, color: '#FB923C', pct: pct(s.avgKcal, s.kcalGoal) } : null,
    s.avgProtein != null ? { label: 'Protein / day', value: `${s.avgProtein} g`, sub: goal(s.avgProtein, s.proteinGoal, 'g'), icon: Beef, color: '#F87171', pct: pct(s.avgProtein, s.proteinGoal) } : null,
    s.avgCarbs != null ? { label: 'Carbs / day', value: `${s.avgCarbs} g`, sub: null, icon: Wheat, color: '#FACC15' } : null,
    s.avgFat != null ? { label: 'Fat / day', value: `${s.avgFat} g`, sub: null, icon: Droplet, color: '#A78BFA' } : null,
    s.mealDays ? { label: 'Food logged', value: `${s.mealDays} of 7`, sub: 'days', icon: Utensils, color: '#4ADE80', pct: Math.round((s.mealDays / 7) * 100) } : null,
    s.weightStartKg != null && s.weightEndKg != null ? { label: 'Weight change', value: (() => { const d = (s.weightEndKg! - s.weightStartKg!) * (lbs ? 2.20462 : 1); return `${d > 0 ? '+' : ''}${d.toFixed(1)} ${unit}`; })(), sub: null, icon: Scale, color: '#38BDF8' } : null,
    s.avgSleepMin != null ? { label: 'Sleep / night', value: hm(s.avgSleepMin), sub: null, icon: Moon, color: '#A5B4FC' } : null,
    s.avgSteps != null ? { label: 'Steps / day', value: s.avgSteps.toLocaleString(), sub: null, icon: Footprints, color: '#4ADE80', pct: pct(s.avgSteps, 10000) } : null,
    s.avgRestingHr != null ? { label: 'Resting HR', value: `${s.avgRestingHr} bpm`, sub: null, icon: HeartPulse, color: '#F87171' } : null,
    s.streak ? { label: 'Streak', value: `${s.streak} days`, sub: null, icon: Zap, color: '#F5A623' } : null,
  ] as (Tile | null)[]).filter((t): t is Tile => !!t);
  // Four tiles by default (an even bento), everything when expanded.
  // Calories and macros live in the nutrition ring above, not as tiles.
  const NUTRI = new Set(['Calories / day', 'Protein / day', 'Carbs / day', 'Fat / day']);
  const numTiles = tiles.filter((t) => !NUTRI.has(t.label));
  const shown = open ? numTiles : numTiles.slice(0, 4);
  const ws = weekScore(s);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {ws.score != null && (
            <span className="w-14 h-14 rounded-2xl bg-accent text-black flex flex-col items-center justify-center flex-shrink-0 wf-dark" style={{ boxShadow: '0 8px 24px rgba(245,166,35,0.3)' }}>
              <span className="text-xl font-black leading-none" style={{ color: '#0A0A0A' }}>{ws.score}</span>
              <span className="text-[8px] font-bold uppercase tracking-wide mt-0.5" style={{ color: '#0A0A0A' }}>score</span>
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide truncate">Coach report · week of {weekLabel}</span>
            </div>
            <p className="text-base font-black text-white leading-snug mt-0.5">{report.headline}</p>
          </div>
        </div>
        <button aria-label="Hide this week's report" onClick={() => { setHidden(true); try { localStorage.setItem(HIDE_KEY, report.week); } catch { /* storage blocked */ } }} className="text-text-tertiary hover:text-white -mt-1 -mr-1 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {ws.axes.length >= 3 && (
        <div className="mt-3 rounded-2xl bg-surface-elevated pt-2 pb-1">
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide px-3.5 pt-1.5">Score breakdown</p>
          <ScoreRadar axes={ws.axes} />
        </div>
      )}

      {s.avgKcal != null && (
        <div className="mt-2.5 rounded-2xl bg-surface-elevated p-3.5">
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide mb-2">Nutrition · average of {s.mealDays} logged {s.mealDays === 1 ? 'day' : 'days'}</p>
          <NutritionRing kcal={s.avgKcal} kcalGoal={s.kcalGoal}
            macros={[
              { label: 'Protein', value: s.avgProtein, goal: s.proteinGoal, color: '#F87171' },
              { label: 'Carbs', value: s.avgCarbs ?? null, goal: (profile?.goals as { carbs?: number } | undefined)?.carbs ?? null, color: '#FACC15' },
              { label: 'Fat', value: s.avgFat ?? null, goal: (profile?.goals as { fat?: number } | undefined)?.fat ?? null, color: '#60A5FA' },
            ]} />
        </div>
      )}

      {/* Equal bento tiles: icon chip, number, label, goal bar where there is one. */}
      <div className="grid grid-cols-2 gap-2.5 mt-2.5" aria-label="This week in numbers">
        {shown.map((t, i) => {
          const Icon = t.icon;
          // An odd tile out spans the row, so the grid always ends square.
          const wide = shown.length % 2 === 1 && i === shown.length - 1;
          return (
            <div key={t.label} className={`rounded-2xl bg-surface-elevated p-3.5 flex flex-col gap-2 min-w-0 min-h-[112px] ${wide ? 'col-span-2' : ''}`}>
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${t.color}22` }}>
                <Icon className="w-4 h-4" style={{ color: t.color }} />
              </span>
              <div className="min-w-0 mt-auto">
                <p className="text-xl font-black text-white tabular-nums leading-tight truncate">{t.value}</p>
                <p className="text-xs text-text-secondary truncate">{t.label}</p>
                {t.sub && <p className="text-[11px] text-text-tertiary truncate">{t.sub}</p>}
              </div>
              {t.pct != null && (
                <div className="h-1 rounded-full bg-black/30 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: t.color }} /></div>
              )}
            </div>
          );
        })}
      </div>

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
        {open ? 'Show less' : `All ${numTiles.length} numbers, wins, one fix and targets`}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </Card>
  );
}
