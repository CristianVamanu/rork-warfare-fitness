'use client';

/**
 * "Your week" on Home: the weekly coach report (/api/ai/weekly-report).
 * Shows the headline and key numbers, expands to wins, the one fix and
 * next week's targets. Hidden only for a week with nothing logged.
 */
import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { ChevronDown, Check, Target, Dumbbell, Layers, Timer, Weight, Flame, Beef, Wheat, Droplet, Utensils, Scale, BicepsFlexed, Moon, Footprints, HeartPulse, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { dayKey } from '@/lib/healthTrends';
import { weekScore, type WeeklyReport } from '@/lib/weeklyReport';

const HIDE_KEY = 'wf-weekly-report-hidden';
// One fetch per week per session: the report for a past week never changes.
let cache: { key: string; report: WeeklyReport | null } | null = null;

export function WeeklyReportCard() {
  const { user, profile } = useAuth();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const key = `${user.uid}:${dayKey(new Date())}`;
    const show = (r: WeeklyReport | null) => {
      if (!alive || !r) return;
      // The card can no longer be hidden; clear any old "hidden" flag.
      try { localStorage.removeItem(HIDE_KEY); } catch { /* storage blocked */ }
      setReport(r);
    };
    if (cache?.key === key) { show(cache.report); return () => { alive = false; }; }
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch(`/api/ai/weekly-report?today=${dayKey(new Date())}&tzo=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json() as { report: WeeklyReport | null };
        cache = { key, report: json.report };
        show(json.report);
      } catch { /* no card */ }
    })();
    return () => { alive = false; };
  }, [user]);

  if (!report) return null;
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
    s.minutes ? { label: 'Training', value: s.minutes >= 60 ? hm(s.minutes) : `${s.minutes} min`, sub: null, icon: Timer, color: '#60A5FA' } : null,
    vol > 0 ? { label: `${unit} lifted`, value: vol >= 100000 ? `${Math.round(vol / 1000)}k` : vol.toLocaleString(), sub: null, icon: Weight, color: '#F5A623' } : null,
    s.avgKcal != null ? { label: 'Calories / day', value: s.avgKcal.toLocaleString(), sub: goal(s.avgKcal, s.kcalGoal, 'kcal'), icon: Flame, color: '#FB923C', pct: pct(s.avgKcal, s.kcalGoal) } : null,
    s.avgProtein != null ? { label: 'Protein / day', value: `${s.avgProtein} g`, sub: goal(s.avgProtein, s.proteinGoal, 'g'), icon: Beef, color: '#F87171', pct: pct(s.avgProtein, s.proteinGoal) } : null,
    s.avgCarbs != null ? { label: 'Carbs / day', value: `${s.avgCarbs} g`, sub: null, icon: Wheat, color: '#FACC15' } : null,
    s.avgFat != null ? { label: 'Fat / day', value: `${s.avgFat} g`, sub: null, icon: Droplet, color: '#A78BFA' } : null,
    s.mealDays ? { label: 'Food logged', value: `${s.mealDays} of 7`, sub: 'days', icon: Utensils, color: '#4ADE80', pct: Math.round((s.mealDays / 7) * 100) } : null,
    s.weightStartKg != null && s.weightEndKg != null ? { label: 'Weight change', value: (() => { const d = (s.weightEndKg! - s.weightStartKg!) * (lbs ? 2.20462 : 1); return `${d > 0 ? '+' : ''}${d.toFixed(1)} ${unit}`; })(), sub: null, icon: Scale, color: '#38BDF8' } : null,
    s.avgSleepMin != null ? { label: 'Sleep / night', value: hm(s.avgSleepMin), sub: null, icon: Moon, color: '#A5B4FC' } : null,
    s.avgSteps != null ? { label: 'Steps / day', value: s.avgSteps.toLocaleString(), sub: null, icon: Footprints, color: '#4ADE80', pct: pct(s.avgSteps, 10000) } : null,
    s.avgRestingHr != null ? { label: 'Resting HR', value: `${s.avgRestingHr} bpm`, sub: null, icon: HeartPulse, color: '#F87171' } : null,
    s.streak ? { label: 'Streak', value: `${s.streak} ${s.streak === 1 ? 'day' : 'days'}`, sub: null, icon: Zap, color: '#F5A623' } : null,
  ] as (Tile | null)[]).filter((t): t is Tile => !!t);
  // Four tiles by default (an even bento), everything when expanded.
  // Calories and macros live in the nutrition ring above, not as tiles.
  const NUTRI = new Set(['Calories / day', 'Protein / day', 'Carbs / day', 'Fat / day']);
  const numTiles = tiles.filter((t) => !NUTRI.has(t.label));
  const shown = open ? numTiles : numTiles.slice(0, 4);
  const ws = weekScore(s);

  // The four headline numbers for the strip; the rest open with the report.
  const strip = numTiles.slice(0, 4);
  const R = 30, C = 2 * Math.PI * R, sc = ws.score ?? 0;
  const kcalPct = pct(s.avgKcal, s.kcalGoal), protPct = pct(s.avgProtein, s.proteinGoal);
  const carbGoal = (profile?.goals as { carbs?: number } | undefined)?.carbs ?? null, fatGoal = (profile?.goals as { fat?: number } | undefined)?.fat ?? null;

  return (
    <Card className="p-0 overflow-hidden relative">
      {/* AI panel: amber hairline on top, faint scan glow behind the dial */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #F5A623, transparent)' }} />
      <div aria-hidden className="absolute -top-16 -left-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(245,166,35,0.18), transparent)' }} />
      <div className="relative p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5">
            <span className="relative flex w-1.5 h-1.5"><span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" /><span className="relative w-1.5 h-1.5 rounded-full bg-accent" /></span>
            <span className="text-[9px] font-black tracking-[0.18em] text-accent uppercase">AI Coach</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Week of {weekLabel}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2.5">
          {ws.score != null && (
            <svg width="72" height="72" viewBox="0 0 72 72" className="flex-shrink-0" role="img" aria-label={`Week score ${sc} of 100`}>
              <circle cx="36" cy="36" r={R} fill="none" stroke="var(--progress-track)" strokeWidth="5" />
              <circle cx="36" cy="36" r={R} fill="none" stroke="#F5A623" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${(sc / 100) * C} ${C}`} transform="rotate(-90 36 36)" style={{ filter: 'drop-shadow(0 0 4px rgba(245,166,35,0.6))' }} />
              <text x="36" y="39" textAnchor="middle" fontSize="20" fontWeight={900} fill="var(--foreground)">{sc}</text>
              <text x="36" y="51" textAnchor="middle" fontSize="7" fontWeight={700} letterSpacing="1.2" fill="var(--text-tertiary)">SCORE</text>
            </svg>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-black text-white leading-snug line-clamp-2">{report.headline}</p>
            <p className="text-xs text-text-secondary leading-snug mt-1 line-clamp-2"><span className="text-accent font-bold">Next move: </span>{report.fix}</p>
          </div>
        </div>

        {strip.length > 0 && (
          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }} aria-label="This week in numbers">
            {strip.map((t) => { const Icon = t.icon; return (
              <div key={t.label} className="rounded-xl px-1.5 py-2 text-center min-w-0 border" style={{ background: 'linear-gradient(180deg,#161411,#0d0c0b)', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-center gap-1 min-w-0">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0 text-text-secondary" strokeWidth={2.2} />
                  <p className={`${t.value.length > 7 ? 'text-[11px]' : t.value.length > 5 ? 'text-[12.5px]' : 'text-[14px]'} font-black text-white tabular-nums leading-none truncate`}>{t.value}</p>
                </div>
                <p className="text-[8.5px] font-bold text-text-tertiary uppercase tracking-wide mt-1 truncate">{t.label}</p>
              </div>); })}
          </div>
        )}

        {s.avgKcal != null && (
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
            {[
              { k: 'Calories', v: `${s.avgKcal.toLocaleString()}${s.kcalGoal ? ` / ${s.kcalGoal.toLocaleString()}` : ''}`, p: kcalPct, c: '#F5A623', I: Flame },
              { k: 'Protein', v: s.avgProtein != null ? `${s.avgProtein}${s.proteinGoal ? ` / ${s.proteinGoal}` : ''} g` : '—', p: protPct, c: '#F87171', I: BicepsFlexed },
              ...(open ? [
                { k: 'Carbs', v: s.avgCarbs != null ? `${s.avgCarbs}${carbGoal ? ` / ${carbGoal}` : ''} g` : '—', p: pct(s.avgCarbs, carbGoal), c: '#FACC15', I: Wheat },
                { k: 'Fat', v: s.avgFat != null ? `${s.avgFat}${fatGoal ? ` / ${fatGoal}` : ''} g` : '—', p: pct(s.avgFat, fatGoal), c: '#60A5FA', I: Droplet },
              ] : []),
            ].map((m) => (
              <div key={m.k} className="min-w-0">
                <div className="flex justify-between items-center text-[10px]"><span className="flex items-center gap-1.5 text-text-tertiary font-semibold uppercase tracking-wide"><m.I className="w-3.5 h-3.5" style={{ color: m.c }} strokeWidth={2.2} />{m.k}</span><span className="text-white font-bold tabular-nums truncate ml-1">{m.v}</span></div>
                <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--progress-track)' }}><div className="h-full rounded-full" style={{ width: `${m.p ?? 0}%`, background: m.c, boxShadow: `0 0 6px ${m.c}` }} /></div>
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="mt-3.5 space-y-3.5">
            {numTiles.length > 4 && (
              // The last row stretches to fill: one leftover tile goes full
              // width, two share the row, so there's never an empty gap.
              <div className="grid grid-cols-6 gap-2">
                {numTiles.slice(4).map((t, i, arr) => { const Icon = t.icon; const rest = arr.length % 3; const inLast = i >= arr.length - rest; return (
                  <div key={t.label} className={`rounded-xl p-2.5 min-w-0 border ${inLast ? (rest === 1 ? 'col-span-6' : 'col-span-3') : 'col-span-2'}`}
                    style={{ background: 'linear-gradient(180deg,#161411,#0d0c0b)', borderColor: 'rgba(255,255,255,0.07)', boxShadow: `inset 0 -2px 0 ${t.color}, 0 8px 16px -12px ${t.color}` }}>
                    <Icon className="w-4 h-4" style={{ color: t.color }} />
                    <p className="text-[15px] font-black text-white tabular-nums mt-1 truncate">{t.value}</p>
                    <p className="text-[9px] text-text-tertiary uppercase tracking-wide truncate">{t.label}</p>
                  </div>); })}
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-success uppercase tracking-wide mb-1.5">What went well</p>
              <ul className="space-y-1.5">
                {report.wins.map((w, i) => <li key={i} className="flex gap-2 text-sm text-white leading-snug"><Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />{w}</li>)}
              </ul>
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

        <button onClick={() => setOpen((v) => !v)} className="mt-2.5 w-full flex items-center justify-center gap-1 text-[11px] font-bold text-accent py-1">
          {open ? 'Show less' : 'Full report'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </Card>
  );
}
