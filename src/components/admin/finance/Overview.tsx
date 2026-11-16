'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';
import { TrendingUp, Repeat, Users, PieChart as PieIcon, CreditCard, Layers, Activity } from 'lucide-react';
import { Panel, Segmented } from '@/components/admin/ui';
import { C, Kpi, FootStat, money, pct, change, Empty, ErrorBox, GridSkeleton, useFinance, Tip, Table, Th, td } from './kit';

type Bucket = { key: string; gross: number; refunds: number; net: number; prevNet: number; succeeded: number; failed: number; pending: number; refunded: number; subscription: number; oneTime: number };
type MrrB = { key: string; mrr: number; newMrr: number; expansion: number; contraction: number; churned: number; net: number; paying: number; newPaying: number; cancelled: number; netCustomers: number; signups: number; arpu: number };
type Plan = { plan: string; price: number; interval: string; active: number; mrr: number; arr: number; share: number; newSubs: number; cancels: number; churnRate: number | null };
export interface OverviewData {
  currency: string; needsSync: boolean; gran: string;
  kpis: {
    revenue: { gross: number; net: number; prevGross: number; prevNet: number; allTimeGross: number; allTimeNet: number; fees: number; count: number };
    mrr: { now: number; atStart: number; newMrr: number; expansion: number; contraction: number; churned: number };
    arr: { now: number; atStart: number };
    customers: { paying: number; atStart: number; newPaying: number; scheduledCancel: number; trialing: number; everPaid: number };
    arpu: { now: number; atStart: number };
    ltv: { actual: number; estimate: number | null; churnMonths: number };
    churn: { rate: number | null; revenueRate: number | null; lost: number; retained: number; monthly: number | null };
    failed: { count: number; amount: number; recovered: number; recoveredCount: number; outstanding: number; rate: number | null };
    refunds: { amount: number; pending: number; pct: number | null; disputesLost: number; prev: number };
  };
  revenue: Bucket[]; mrr: MrrB[]; plans: Plan[]; cohorts: { cohort: string; size: number; cells: (number | null)[] }[];
  store: { gross: number; count: number }; meta: { storeLedgerSince: number | null; mirrorSince: number | null };
}

const axis = { stroke: C.dim, fontSize: 11, tickLine: false, axisLine: false } as const;
const label = (k: string) => (k.length === 10 ? new Date(k + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : k.length === 7 ? new Date(k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : k);
const PIE = [C.amber, C.signal, C.info, C.amber2, '#A78BFA', C.alert, C.dim];

export function Overview({ params }: { params: Record<string, string | number> }) {
  const [gran, setGran] = useState<'auto' | 'day' | 'week' | 'month' | 'year'>('auto');
  const [compare, setCompare] = useState(true);
  const { data, error, loading, reload } = useFinance<OverviewData>({ ...params, view: 'overview', gran: gran === 'auto' ? undefined : gran });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-3"><GridSkeleton n={4} /><GridSkeleton n={4} /></div>;
  const k = data.kpis, cur = data.currency;
  const rev = data.revenue.map((b) => ({ ...b, label: label(b.key) }));
  const mrr = data.mrr.map((b) => ({ ...b, label: label(b.key) }));
  const mrrNet = k.mrr.newMrr + k.mrr.expansion - k.mrr.contraction - k.mrr.churned;
  const noData = !k.revenue.allTimeGross && !k.mrr.now;

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {noData && <Panel><Empty title="No payment data in this currency yet" body={data.needsSync ? 'Run the first sync from Stripe (top right) to import your payment history.' : 'Payments will appear here as soon as Stripe processes them.'} /></Panel>}

      {/* KPI row 1: money in, recurring, customers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Revenue · period" value={money(k.revenue.net, cur)} delta={change(k.revenue.net, k.revenue.prevNet)} spark={rev.map((r) => r.net)}
          sub={<>Net collected. Gross {money(k.revenue.gross, cur)}</>}
          foot={<><FootStat k="All-time net" v={money(k.revenue.allTimeNet, cur, true)} /><FootStat k="Previous" v={money(k.revenue.prevNet, cur, true)} /><FootStat k="Payments" v={k.revenue.count} /><FootStat k="Stripe fees" v={money(k.revenue.fees, cur, true)} /></>} />
        <Kpi label="MRR" value={money(k.mrr.now, cur)} delta={change(k.mrr.now, k.mrr.atStart)} spark={mrr.map((m) => m.mrr)} tone="signal"
          sub="Recurring revenue active now"
          foot={<><FootStat k="New" v={money(k.mrr.newMrr, cur, true)} tone="ok" /><FootStat k="Expansion" v={money(k.mrr.expansion, cur, true)} tone="ok" /><FootStat k="Contraction" v={money(-k.mrr.contraction, cur, true)} tone={k.mrr.contraction ? 'bad' : undefined} /><FootStat k="Churned" v={money(-k.mrr.churned, cur, true)} tone={k.mrr.churned ? 'bad' : undefined} /></>} />
        <Kpi label="ARR" value={money(k.arr.now, cur)} delta={change(k.arr.now, k.arr.atStart)} sub="MRR × 12, from active subscriptions" tone="signal"
          foot={<><FootStat k="Net MRR change" v={money(mrrNet, cur, true)} tone={mrrNet >= 0 ? 'ok' : 'bad'} /><FootStat k="At period start" v={money(k.arr.atStart, cur, true)} /></>} />
        <Kpi label="Paying customers" value={k.customers.paying.toLocaleString()} delta={change(k.customers.paying, k.customers.atStart)} spark={mrr.map((m) => m.paying)}
          sub="Active or past due, trials excluded"
          foot={<><FootStat k="New" v={k.customers.newPaying} tone="ok" /><FootStat k="On trial" v={k.customers.trialing} /><FootStat k="Cancelling" v={k.customers.scheduledCancel} /><FootStat k="Ever paid" v={k.customers.everPaid} /></>} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi label="ARPU" value={money(k.arpu.now, cur)} delta={change(k.arpu.now, k.arpu.atStart)} spark={mrr.map((m) => m.arpu)} sub="Monthly, per paying customer (now)" />
        <Kpi label="Lifetime value" value={money(k.ltv.actual, cur)} sub={<>Actual net per customer.<br />Estimated: {k.ltv.estimate != null ? money(k.ltv.estimate, cur) : 'needs more history'}</>} />
        <Kpi label="Churn · period" value={pct(k.churn.rate)} invert delta={null} tone="alert" sub={<>{k.churn.lost} lost · {k.churn.retained} retained<br />Revenue churn {pct(k.churn.revenueRate)}</>} />
        <Kpi label="Failed payments" value={money(k.failed.amount, cur)} tone="alert" sub={<>{k.failed.count} failed in period<br />Recovered {money(k.failed.recovered, cur)} · outstanding {money(k.failed.outstanding, cur)}</>} />
        <Kpi label="Refunds" value={money(k.refunds.amount, cur)} invert delta={change(k.refunds.amount, k.refunds.prev)} tone="alert" sub={<>{pct(k.refunds.pct)} of gross{k.refunds.pending ? ` · ${money(k.refunds.pending, cur)} pending` : ''}{k.refunds.disputesLost ? <><br />Disputes lost {money(k.refunds.disputesLost, cur)}</> : null}</>} />
      </div>

      {/* A. Revenue performance */}
      <Panel title="Revenue performance" icon={TrendingUp} action={
        <div className="flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-1.5 text-xs text-text-secondary"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[#F5A623]" />Compare previous</label>
          <Segmented value={gran} onChange={setGran} options={[{ id: 'auto', label: 'Auto' }, { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }]} />
        </div>}>
        {rev.some((r) => r.gross || r.prevNet) ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rev} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="gRev" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={C.amber} stopOpacity={0.35} /><stop offset="100%" stopColor={C.amber} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" {...axis} minTickGap={24} />
                <YAxis {...axis} width={64} tickFormatter={(v) => money(v, cur, true)} />
                <Tooltip content={<Tip cur={cur} />} cursor={{ stroke: 'rgba(255,255,255,.15)' }} />
                <Area type="monotone" dataKey="net" name="Net revenue" stroke={C.amber} strokeWidth={2} fill="url(#gRev)" animationDuration={500} />
                <Line type="monotone" dataKey="refunds" name="Refunds" stroke={C.alert} strokeWidth={1.5} dot={false} animationDuration={500} />
                {compare && <Line type="monotone" dataKey="prevNet" name="Previous period" stroke={C.dim} strokeDasharray="4 4" strokeWidth={1.5} dot={false} animationDuration={500} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="No revenue in this period" />}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* B. MRR growth */}
        <Panel title="MRR growth" icon={Repeat} action={<span className="text-xs text-text-secondary">Net {money(mrrNet, cur)}</span>}>
          {mrr.some((m) => m.mrr || m.newMrr || m.churned) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mrr} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="label" {...axis} minTickGap={20} />
                  <YAxis yAxisId="m" {...axis} width={64} tickFormatter={(v) => money(v, cur, true)} />
                  <Tooltip content={<Tip cur={cur} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.dim }} iconType="circle" iconSize={8} />
                  <ReferenceLine yAxisId="m" y={0} stroke={C.line} />
                  <Bar yAxisId="m" dataKey="newMrr" name="New" stackId="mv" fill={C.signal} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="m" dataKey="expansion" name="Expansion" stackId="mv" fill={C.ok} />
                  <Bar yAxisId="m" dataKey="contraction" name="Contraction" stackId="mv" fill={C.amber2} />
                  <Bar yAxisId="m" dataKey="churned" name="Churned" stackId="mv" fill={C.alert} radius={[0, 0, 3, 3]} />
                  <Line yAxisId="m" type="monotone" dataKey="mrr" name="MRR" stroke={C.amber} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No recurring revenue yet" />}
          <p className="text-[11px] text-text-tertiary">Expansion and contraction are recorded from plan changes since {data.meta.mirrorSince ? new Date(data.meta.mirrorSince * 1000).toLocaleDateString() : 'the first sync'}; Stripe keeps no earlier price history.</p>
        </Panel>

        {/* C. Revenue breakdown */}
        <Panel title="Revenue breakdown" icon={Layers}>
          {(() => {
            const sub = rev.reduce((a, r) => a + r.subscription, 0), one = rev.reduce((a, r) => a + r.oneTime, 0);
            const rows = [
              ['Subscriptions', sub, C.amber], ['One-time payments', one, C.signal],
              ...(data.store.gross ? [['Google Play (gross, via RevenueCat)', data.store.gross, C.info]] : []),
              ['Refunds', -k.refunds.amount, C.alert], ...(k.refunds.disputesLost ? [['Disputes lost', -k.refunds.disputesLost, C.alert]] : []),
            ] as [string, number, string][];
            const max = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
            return (
              <div className="flex flex-col gap-3">
                {rows.map(([l, v, c]) => (
                  <div key={l} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs"><span className="text-text-secondary">{l}</span><span className={`font-semibold tabular-nums ${v < 0 ? 'text-danger' : 'text-white'}`}>{money(v, cur)}</span></div>
                    <div className="h-2 rounded-full bg-white/6 overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(Math.abs(v) / max) * 100}%`, background: c }} /></div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-white/8 text-sm"><span className="font-bold text-white">Net collected (Stripe)</span><span className="font-extrabold text-accent tabular-nums">{money(k.revenue.net, cur)}</span></div>
                {data.store.gross > 0 && <p className="text-[11px] text-text-tertiary">Google Play is shown at store price before Google&apos;s commission and is not included in Stripe net. Recorded since {data.meta.storeLedgerSince ? new Date(data.meta.storeLedgerSince * 1000).toLocaleDateString() : '—'}.</p>}
              </div>
            );
          })()}
        </Panel>

        {/* D. Customer growth */}
        <Panel title="Customer growth" icon={Users}>
          {mrr.some((m) => m.paying || m.signups || m.newPaying) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mrr} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="label" {...axis} minTickGap={20} />
                  <YAxis yAxisId="l" {...axis} width={36} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" {...axis} width={36} allowDecimals={false} />
                  <Tooltip content={<Tip cur={cur} fmt="count" />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.dim }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="l" dataKey="signups" name="Registrations" fill="rgba(138,150,161,.45)" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="l" dataKey="newPaying" name="New paying" fill={C.signal} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="l" dataKey="cancelled" name="Cancelled" fill={C.alert} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="paying" name="Active paying" stroke={C.amber} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No customer activity in this period" />}
        </Panel>

        {/* E. Subscription distribution */}
        <Panel title="Subscription distribution" icon={PieIcon}>
          {data.plans.some((p) => p.active) ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-44 h-44 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={data.plans.filter((p) => p.active)} dataKey="mrr" nameKey="plan" innerRadius="62%" outerRadius="100%" stroke="none" paddingAngle={2} animationDuration={500}>
                    {data.plans.filter((p) => p.active).map((p, i) => <Cell key={p.plan} fill={PIE[i % PIE.length]} />)}
                  </Pie><Tooltip content={<Tip cur={cur} />} /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full flex flex-col gap-2">
                {data.plans.filter((p) => p.active).map((p, i) => (
                  <div key={p.plan} className="flex items-center gap-2 text-xs">
                    <i className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE[i % PIE.length] }} />
                    <span className="text-white font-semibold truncate flex-1">{p.plan}</span>
                    <span className="text-text-secondary tabular-nums">{p.active} · {pct(p.share, 0)}</span>
                    <span className="text-white font-semibold tabular-nums w-24 text-right">{money(p.mrr, cur)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty title="No active subscriptions" />}
        </Panel>

        {/* F. Payment performance */}
        <Panel title="Payment performance" icon={CreditCard}>
          {rev.some((r) => r.succeeded || r.failed || r.pending || r.refunded) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rev} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="label" {...axis} minTickGap={20} />
                  <YAxis {...axis} width={32} allowDecimals={false} />
                  <Tooltip content={<Tip cur={cur} fmt="count" />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.dim }} iconType="circle" iconSize={8} />
                  <Bar dataKey="succeeded" name="Succeeded" stackId="p" fill={C.ok} />
                  <Bar dataKey="failed" name="Failed" stackId="p" fill={C.alert} />
                  <Bar dataKey="pending" name="Pending" stackId="p" fill={C.amber} />
                  <Bar dataKey="refunded" name="Refunded" stackId="p" fill={C.dim} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No payments in this period" />}
        </Panel>
      </div>

      {/* G. Retention */}
      <Panel title="Customer retention · monthly cohorts" icon={Activity} action={<span className="text-xs text-text-secondary">Monthly churn {pct(k.churn.monthly)}</span>}>
        {data.cohorts.length ? (
          <Table minWidth={760} head={<><Th>Cohort</Th><Th right>Size</Th>{Array.from({ length: 12 }, (_, i) => <Th key={i} right>M{i}</Th>)}</>}>
            {data.cohorts.map((c) => (
              <tr key={c.cohort}>
                <td className={`${td} font-semibold text-white`}>{label(c.cohort)}</td>
                <td className={`${td} text-right tabular-nums`}>{c.size}</td>
                {c.cells.map((v, i) => (
                  <td key={i} className="px-1 py-1">
                    {v == null ? null : <div className="h-8 rounded-md flex items-center justify-center text-[11px] font-semibold tabular-nums" style={{ background: `rgba(245,166,35,${0.08 + v * 0.62})`, color: v > 0.55 ? '#0A0A0A' : '#fff' }}>{Math.round(v * 100)}%</div>}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        ) : <Empty title="Not enough history for cohorts yet" body="A cohort appears once customers have paid for at least one month." />}
      </Panel>
    </div>
  );
}

