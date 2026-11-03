'use client';

/**
 * Admin → Retention: do members stick around, and where do they drop off.
 * Data from /api/admin/retention (maths in lib/retention).
 */
import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { RetentionReport, Rate } from '@/lib/retention';

const pct = (r: Rate) => (r.pct == null ? '—' : `${r.pct}%`);

/** Cell tint by value: the higher, the stronger the accent. */
function Cell({ r }: { r: Rate }) {
  const a = r.pct == null ? 0 : Math.min(0.55, 0.08 + (r.pct / 100) * 0.5);
  return (
    <td className="px-2.5 py-2 text-center tabular-nums whitespace-nowrap" style={{ background: r.pct == null ? undefined : `rgba(var(--accent-rgb) / ${a})` }} title={r.of ? `${r.n} of ${r.of}` : 'Too new to measure'}>
      <span className={r.pct == null ? 'text-text-tertiary' : 'text-white font-semibold'}>{pct(r)}</span>
    </td>
  );
}

function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-white tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-text-secondary">{sub}</p>}
      <p className="text-[11px] text-text-tertiary mt-1 leading-snug">{hint}</p>
    </Card>
  );
}

export function RetentionPanel() {
  const { user } = useAuth();
  const [data, setData] = useState<(RetentionReport & { truncated?: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/retention', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setData(json);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not load retention'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  if (!data) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }
  const o = data.overall;
  const sub = (r: Rate) => (r.of ? `${r.n} of ${r.of} members` : 'Not enough members old enough yet');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">Retention</h2>
          <p className="text-xs text-text-secondary">Members who signed up in the last 12 weeks. Staff accounts excluded.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Members" value={data.totals.members.toLocaleString()} hint="All member accounts" />
        <Stat label="Active today" value={String(data.totals.dau)} hint="Logged anything in the last 24h" />
        <Stat label="Active this week" value={String(data.totals.wau)} hint="Last 7 days" />
        <Stat label="Active this month" value={String(data.totals.mau)} sub={data.totals.mau ? `Stickiness ${Math.round((data.totals.dau / data.totals.mau) * 100)}% (today ÷ month)` : undefined} hint="Last 30 days" />
      </div>

      <div>
        <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wide mb-2">The journey</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="First workout" value={pct(o.firstWorkout)} sub={sub(o.firstWorkout)} hint="Finished a workout within 7 days of signing up. The most important number here." />
          <Stat label="First week" value={pct(o.firstWeek)} sub={sub(o.firstWeek)} hint="3+ workouts in the first 7 days" />
          <Stat label="Day 1 back" value={pct(o.d1)} sub={sub(o.d1)} hint="Came back on day 1 or 2" />
          <Stat label="Day 7 back" value={pct(o.d7)} sub={sub(o.d7)} hint="Active on any day 7-13" />
          <Stat label="Day 30 back" value={pct(o.d30)} sub={sub(o.d30)} hint="Active on any day 30-44" />
          <Stat label="Paying" value={pct(o.paid)} sub={sub(o.paid)} hint="Has a Stripe subscription now (admin grants not counted)" />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-white">Weekly cohorts</p>
          <p className="text-[11px] text-text-tertiary">Each row is everyone who signed up that week. A dash means the week is too recent to measure yet. Tap a cell for the counts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary text-[10px] uppercase tracking-wide">
                {['Week of', 'Signups', 'Workout', 'Week 1', 'Day 1', 'Day 7', 'Day 30', 'Paying'].map((h) => <th key={h} className="px-2.5 py-2 font-bold text-center first:text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-text-tertiary">No signups in the last 12 weeks.</td></tr>}
              {data.cohorts.map((c) => (
                <tr key={c.week} className="border-t border-white/5">
                  <td className="px-2.5 py-2 text-white font-semibold whitespace-nowrap">{new Date(`${c.week}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums text-white">{c.signups}</td>
                  <Cell r={c.firstWorkout} /><Cell r={c.firstWeek} /><Cell r={c.d1} /><Cell r={c.d7} /><Cell r={c.d30} /><Cell r={c.paid} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-white">Programs</p>
          <p className="text-[11px] text-text-tertiary">Everyone currently enrolled. Stalled = not finished and nothing logged for 14 days. A program with many stalled members is the one to fix.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary text-[10px] uppercase tracking-wide">
                {['Program', 'Enrolled', 'Avg done', 'Past halfway', 'Stalled'].map((h) => <th key={h} className="px-2.5 py-2 font-bold text-center first:text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.programs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">Nobody is enrolled in a program.</td></tr>}
              {data.programs.map((p) => (
                <tr key={p.programId} className="border-t border-white/5">
                  <td className="px-2.5 py-2 text-white font-semibold">{p.name}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums text-white">{p.enrolled}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums text-white">{p.avgPct}%</td>
                  <Cell r={p.finishedHalf} />
                  <td className={`px-2.5 py-2 text-center tabular-nums font-semibold ${p.stalled / p.enrolled > 0.5 ? 'text-danger' : 'text-white'}`}>{p.stalled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Active means logged anything: a workout, meal, water, weight and so on. Opening the app without logging does not count.
        Numbers from small groups swing a lot; read them as direction, not precision, until a cohort has 30+ signups.
        {data.truncated ? ' The activity log hit the read limit, so the oldest weeks may be undercounted.' : ''}
      </p>
    </div>
  );
}
