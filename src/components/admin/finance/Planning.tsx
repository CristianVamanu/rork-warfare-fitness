'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { LineChart as LineIcon, Download, FileText, Info } from 'lucide-react';
import { Panel } from '@/components/admin/ui';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { C, money, pct, Kpi, ErrorBox, GridSkeleton, useFinance, Tip, authedFetch } from './kit';

interface Fc {
  currency: string;
  forecast: {
    revenue: Record<'conservative' | 'expected' | 'optimistic', Record<'d30' | 'd90' | 'm12', number>>;
    renewals: Record<'d30' | 'd90' | 'm12', number>;
    projected: Record<'conservative' | 'expected' | 'optimistic', { mrr3: number; mrr12: number }>;
    mrr: number; arr: number; note: string;
    assumptions: { churn: Record<string, number>; churnObserved: boolean; churnMonths: number; trialConversion: number; trialObserved: boolean; pastDueRecovery: number };
  };
}
export function Forecast({ params }: { params: Record<string, string | number> }) {
  const { data, error, reload } = useFinance<Fc>({ ...params, view: 'forecast' });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <GridSkeleton n={6} />;
  const f = data.forecast, cur = data.currency, a = f.assumptions;
  const chart = (['d30', 'd90', 'm12'] as const).map((h) => ({ label: { d30: 'Next 30 days', d90: 'Next 90 days', m12: 'Next 12 months' }[h], Conservative: f.revenue.conservative[h], Expected: f.revenue.expected[h], Optimistic: f.revenue.optimistic[h] }));
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-white flex gap-2"><Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" /><span><b>Estimates, not collected revenue.</b> {f.note}</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Expected · 30 days" value={money(f.revenue.expected.d30, cur)} sub={`${money(f.revenue.conservative.d30, cur)} – ${money(f.revenue.optimistic.d30, cur)} · ~${f.renewals.d30} renewals`} />
        <Kpi label="Expected · 90 days" value={money(f.revenue.expected.d90, cur)} sub={`${money(f.revenue.conservative.d90, cur)} – ${money(f.revenue.optimistic.d90, cur)} · ~${f.renewals.d90} renewals`} />
        <Kpi label="Expected · 12 months" value={money(f.revenue.expected.m12, cur)} sub={`${money(f.revenue.conservative.m12, cur)} – ${money(f.revenue.optimistic.m12, cur)} · ~${f.renewals.m12} renewals`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="MRR now" value={money(f.mrr, cur)} tone="signal" /><Kpi label="ARR now" value={money(f.arr, cur)} tone="signal" />
        <Kpi label="Projected MRR · 3 months" value={money(f.projected.expected.mrr3, cur)} sub={`${money(f.projected.conservative.mrr3, cur)} – ${money(f.projected.optimistic.mrr3, cur)}, existing customers only`} />
        <Kpi label="Projected ARR · 12 months" value={money(f.projected.expected.mrr12 * 12, cur)} sub={`${money(f.projected.conservative.mrr12 * 12, cur)} – ${money(f.projected.optimistic.mrr12 * 12, cur)}`} />
      </div>
      <Panel title="Scenarios" icon={LineIcon}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="label" stroke={C.dim} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={C.dim} fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => money(v, cur, true)} />
              <Tooltip content={<Tip cur={cur} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.dim }} iconType="circle" iconSize={8} />
              <Bar dataKey="Conservative" fill={C.dim} radius={[3, 3, 0, 0]} /><Bar dataKey="Expected" fill={C.amber} radius={[3, 3, 0, 0]} /><Bar dataKey="Optimistic" fill={C.signal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-surface-elevated p-3"><p className="text-text-secondary">Monthly churn used</p><p className="text-white font-semibold">{pct(a.churn.conservative)} / {pct(a.churn.expected)} / {pct(a.churn.optimistic)}</p><p className="text-text-tertiary mt-1">{a.churnObserved ? `Measured over the last ${a.churnMonths} months.` : 'Assumed 5% (not enough history yet to measure).'}</p></div>
          <div className="rounded-xl bg-surface-elevated p-3"><p className="text-text-secondary">Trial conversion</p><p className="text-white font-semibold">{pct(a.trialConversion)}</p><p className="text-text-tertiary mt-1">{a.trialObserved ? 'Measured from trials that have ended.' : 'Assumed (fewer than 5 trials have ended).'}</p></div>
          <div className="rounded-xl bg-surface-elevated p-3"><p className="text-text-secondary">Past-due recovery</p><p className="text-white font-semibold">{pct(a.pastDueRecovery)}</p><p className="text-text-tertiary mt-1">Applied to subscriptions currently past due. Scheduled cancellations are excluded.</p></div>
        </div>
      </Panel>
    </div>
  );
}

const EXPORTS: [string, string, string][] = [
  ['summary', 'Financial summary report', 'Every headline metric for the period, with its definition'],
  ['transactions', 'All transactions', 'Payments, renewals, one-time purchases, refunds, failures and chargebacks'],
  ['customers', 'Paying customers', 'Every customer with plan, totals, lifetime value and status'],
  ['subscriptions', 'Subscriptions', 'Every subscription with dates and cancellation state'],
  ['refunds', 'Refunds', 'Refunds in the period with the original charge'],
  ['failed', 'Failed payments', 'Failed charges in the period with the failure reason'],
];
export function Reports({ params, rangeLabel }: { params: Record<string, string | number>; rangeLabel: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (kind: string) => {
    if (!user) return;
    setBusy(kind);
    try {
      const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), kind });
      const res = await authedFetch(user, `/api/admin/finance/export?${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed');
      const blob = await res.blob();
      const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `finance-${kind}.csv`;
      const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; el.click(); URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Panel title="Revenue reports & exports" icon={FileText} action={<span className="text-xs text-text-secondary">{rangeLabel} · {String(params.cur ?? '').toUpperCase()}</span>}>
      <p className="text-xs text-text-secondary">Exports use the date range and currency selected above. Amounts are in major units with a currency column; dates are UTC. Each export is recorded in the finance audit log.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {EXPORTS.map(([k, t, d]) => (
          <div key={k} className="rounded-2xl border border-white/8 p-4 flex flex-col gap-3 hover:border-accent/30 transition-colors">
            <div><p className="text-sm font-bold text-white">{t}</p><p className="text-xs text-text-secondary">{d}</p></div>
            <Button size="sm" variant={k === 'summary' ? 'primary' : 'secondary'} onClick={() => run(k)} loading={busy === k} className="self-start"><Download className="w-3.5 h-3.5 mr-1.5" />Download CSV</Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
