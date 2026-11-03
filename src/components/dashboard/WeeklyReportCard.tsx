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

export function WeeklyReportCard() {
  const { user, profile } = useAuth();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch(`/api/ai/weekly-report?today=${dayKey(new Date())}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json() as { report: WeeklyReport | null };
        if (!alive || !json.report) return;
        try { if (localStorage.getItem(HIDE_KEY) === json.report.week) setHidden(true); } catch { /* storage blocked */ }
        setReport(json.report);
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
  const tiles = [
    { label: 'Workouts', value: String(s.workouts) },
    { label: 'Sets', value: String(s.sets) },
    { label: `Lifted (${unit})`, value: vol >= 10000 ? `${(vol / 1000).toFixed(1)}k` : vol.toLocaleString() },
    s.avgProtein != null ? { label: 'Protein / day', value: `${s.avgProtein} g` } : s.avgSleepMin != null ? { label: 'Sleep / night', value: `${Math.floor(s.avgSleepMin / 60)}h ${String(s.avgSleepMin % 60).padStart(2, '0')}` } : { label: 'Minutes', value: String(s.minutes) },
  ];

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

      <div className="grid grid-cols-4 gap-2 mt-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-surface-elevated px-2 py-2 text-center min-w-0">
            <p className="text-base font-black text-white tabular-nums truncate">{t.value}</p>
            <p className="text-[10px] text-text-tertiary truncate">{t.label}</p>
          </div>
        ))}
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
        {open ? 'Show less' : 'Wins, one fix and this week’s targets'}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </Card>
  );
}
