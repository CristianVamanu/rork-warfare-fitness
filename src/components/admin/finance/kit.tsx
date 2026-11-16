'use client';

/**
 * Building blocks for the Finance screens, in the admin's existing visual
 * language (Card, Panel, Pill; amber accent on graphite). Data always comes
 * from /api/admin/finance; nothing here computes money.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Inbox, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { formatMoney } from '@/lib/finance/money';

export const C = { amber: '#F5A623', amber2: '#D9700A', signal: '#4FE3C1', alert: '#FF6B5B', dim: '#8A96A1', line: '#222222', info: '#3B82F6', ok: '#10B981' };

export const money = (minor: number | null | undefined, cur: string, compact = false) => (minor == null ? '—' : formatMoney(Math.round(minor), cur, { compact }));
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
export const date = (t: number | null | undefined, withTime = false) => (t ? new Date(t * 1000).toLocaleString(undefined, withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export function change(cur: number, prev: number): number | null { return prev ? (cur - prev) / Math.abs(prev) : cur ? null : 0; }

// ---------- data ----------
export interface Range { from: number; to: number; preset: string }
export function useFinance<T>(params: Record<string, string | number | undefined | null>, deps: unknown[] = []) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!user) return;
    const n = ++seq.current; setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
      const res = await fetch(`/api/admin/finance?${qs}`, { headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
      const j = await res.json().catch(() => ({}));
      if (n !== seq.current) return;
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      setData(j as T);
    } catch (e) { if (n === seq.current) setError((e as Error).message); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, JSON.stringify(params), ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

export async function authedFetch(user: Parameters<typeof getIdToken>[0], url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await getIdToken(user)}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
}

// ---------- date range ----------
const DAY = 86_400;
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function presetRange(id: string): Range {
  const now = new Date(); const t = (d: Date) => Math.floor(d.getTime() / 1000); const today = startOfDay(now);
  const end = t(now) + 1;
  switch (id) {
    case 'today': return { preset: id, from: t(today), to: end };
    case 'yesterday': return { preset: id, from: t(today) - DAY, to: t(today) };
    case '7d': return { preset: id, from: t(today) - 6 * DAY, to: end };
    case '90d': return { preset: id, from: t(today) - 89 * DAY, to: end };
    case 'month': return { preset: id, from: t(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
    case 'lastmonth': return { preset: id, from: t(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: t(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case 'quarter': return { preset: id, from: t(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: end };
    case 'year': return { preset: id, from: t(new Date(now.getFullYear(), 0, 1)), to: end };
    case 'lastyear': return { preset: id, from: t(new Date(now.getFullYear() - 1, 0, 1)), to: t(new Date(now.getFullYear(), 0, 1)) };
    case 'all': return { preset: id, from: t(new Date(2020, 0, 1)), to: end };
    default: return { preset: '30d', from: t(today) - 29 * DAY, to: end };
  }
}
export const PRESETS: [string, string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'], ['lastyear', 'Last year'], ['all', 'All time'], ['custom', 'Custom…']];

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const toInput = (t: number) => new Date(t * 1000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const fromInput = (s: string) => Math.floor(new Date(`${s}T00:00:00`).getTime() / 1000);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Date range" value={value.preset} onChange={(e) => onChange(e.target.value === 'custom' ? { ...value, preset: 'custom' } : presetRange(e.target.value))}
        className="h-9 rounded-full bg-surface border border-white/10 px-3.5 text-xs font-semibold text-white focus:outline-none focus:border-accent/60">
        {PRESETS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
      </select>
      {value.preset === 'custom' && (
        <span className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input type="date" aria-label="From" value={toInput(value.from)} max={toInput(value.to - 1)} onChange={(e) => e.target.value && onChange({ ...value, from: fromInput(e.target.value) })} className="h-9 rounded-lg bg-surface border border-white/10 px-2 text-white" />
          to
          <input type="date" aria-label="To" value={toInput(value.to - 1)} onChange={(e) => e.target.value && onChange({ ...value, to: fromInput(e.target.value) + DAY })} className="h-9 rounded-lg bg-surface border border-white/10 px-2 text-white" />
        </span>
      )}
    </div>
  );
}

// ---------- KPI card ----------
export function Kpi({ label, value, sub, delta, invert = false, spark, loading, tone, foot }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number | null; invert?: boolean;
  spark?: number[]; loading?: boolean; tone?: 'accent' | 'signal' | 'alert'; foot?: React.ReactNode;
}) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  const color = tone === 'alert' ? C.alert : tone === 'signal' ? C.signal : C.amber;
  return (
    <Card className="relative overflow-hidden p-4 lg:p-5 flex flex-col gap-2 min-w-0 transition-colors hover:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary truncate">{label}</span>
        {delta != null && Number.isFinite(delta) && !loading && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${good == null ? 'bg-white/6 text-text-secondary' : good ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
            {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}{pct(Math.abs(delta))}
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-8 w-32" /> : <p className="text-[26px] lg:text-[30px] font-extrabold tracking-tight text-white leading-none tabular-nums truncate">{value}</p>}
      {sub && !loading && <div className="text-xs text-text-tertiary leading-snug">{sub}</div>}
      {spark && spark.length > 1 && !loading && (
        <div className="h-10 -mx-1 mt-auto" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs><linearGradient id={`sp-${label.replace(/\W/g, '')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#sp-${label.replace(/\W/g, '')})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {foot && !loading && <div className="pt-2 mt-1 border-t border-white/6 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">{foot}</div>}
    </Card>
  );
}
export function FootStat({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'ok' | 'bad' }) {
  return <div className="flex items-center justify-between gap-2 min-w-0"><span className="text-text-tertiary truncate">{k}</span><span className={`font-semibold tabular-nums ${tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-white'}`}>{v}</span></div>;
}

// ---------- states ----------
export function Empty({ title = 'Nothing here yet', body }: { title?: string; body?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center text-center gap-2 py-10 text-text-secondary"><Inbox className="w-6 h-6 text-text-tertiary" /><p className="text-sm font-semibold text-white">{title}</p>{body && <p className="text-xs max-w-sm">{body}</p>}</div>;
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <Card className="p-4 flex items-center gap-3 border-danger/30"><AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" /><p className="text-sm text-white flex-1">{error}</p>{onRetry && <button onClick={onRetry} className="text-xs font-bold text-accent">Retry</button>}</Card>;
}
export function GridSkeleton({ n = 4 }: { n?: number }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{Array.from({ length: n }, (_, i) => <Card key={i} className="p-5 space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-36" /><Skeleton className="h-10 w-full" /></Card>)}</div>;
}

// ---------- status ----------
const ST: Record<string, [string, string]> = {
  active: ['Active', 'bg-success/15 text-success'], cancelling: ['Cancels at period end', 'bg-accent-muted text-accent'], trial: ['Trial', 'bg-info/15 text-info'],
  past_due: ['Past due', 'bg-danger/15 text-danger'], payment_failed: ['Payment failed', 'bg-danger/15 text-danger'], cancelled: ['Cancelled', 'bg-white/6 text-text-secondary'],
  expired: ['Expired', 'bg-white/6 text-text-secondary'], incomplete: ['Incomplete', 'bg-white/6 text-text-secondary'], paused: ['Paused', 'bg-info/15 text-info'], one_time: ['One-time', 'bg-white/6 text-text-secondary'],
  succeeded: ['Succeeded', 'bg-success/15 text-success'], failed: ['Failed', 'bg-danger/15 text-danger'], pending: ['Pending', 'bg-accent-muted text-accent'],
  refunded: ['Refunded', 'bg-white/6 text-text-secondary'], partially_refunded: ['Part refunded', 'bg-accent-muted text-accent'], disputed: ['Disputed', 'bg-danger/15 text-danger'],
  won: ['Won', 'bg-success/15 text-success'], lost: ['Lost', 'bg-danger/15 text-danger'], needs_response: ['Needs response', 'bg-danger/15 text-danger'], under_review: ['Under review', 'bg-accent-muted text-accent'],
  canceled: ['Cancelled', 'bg-white/6 text-text-secondary'], requires_action: ['Needs action', 'bg-accent-muted text-accent'],
};
export function Status({ s }: { s: string | null | undefined }) {
  if (!s) return <span className="text-text-tertiary">—</span>;
  const [l, cls] = ST[s] ?? [s.replace(/_/g, ' '), 'bg-white/6 text-text-secondary'];
  return <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap capitalize ${cls}`}>{l}</span>;
}

// ---------- table ----------
export function Table({ head, children, minWidth = 900 }: { head: React.ReactNode; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-4 lg:-mx-5">
      <table className="w-full text-[13px]" style={{ minWidth }}>
        <thead className="text-[11px] uppercase tracking-[0.1em] text-text-secondary"><tr className="border-b border-white/8">{head}</tr></thead>
        <tbody className="divide-y divide-white/6">{children}</tbody>
      </table>
    </div>
  );
}
export function Th({ children, right, sort, onSort, active, dir }: { children: React.ReactNode; right?: boolean; sort?: string; onSort?: (k: string) => void; active?: boolean; dir?: 'asc' | 'desc' }) {
  return (
    <th className={`px-4 lg:px-5 py-2.5 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {sort && onSort ? <button onClick={() => onSort(sort)} className={`inline-flex items-center gap-1 hover:text-white ${active ? 'text-white' : ''}`}>{children}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : children}
    </th>
  );
}
export const td = 'px-4 lg:px-5 py-3 whitespace-nowrap';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 pt-1 text-xs text-text-secondary">
      <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total.toLocaleString()}` : '0 results'}</span>
      <span className="flex items-center gap-1">
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/6 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/6 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
      </span>
    </div>
  );
}

export function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
export const selectCls = 'h-9 rounded-full bg-surface border border-white/10 px-3.5 text-xs font-semibold text-white focus:outline-none focus:border-accent/60';
export const inputCls = 'h-9 rounded-full bg-surface border border-white/10 px-3.5 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/60';

/** Chart tooltip in the admin style. */
export function Tip({ active, payload, label, cur, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; cur: string; fmt?: 'money' | 'count' | 'pct' }) {
  if (!active || !payload?.length) return null;
  const f = (v: number) => (fmt === 'count' ? v.toLocaleString() : fmt === 'pct' ? pct(v) : money(v, cur));
  return (
    <div className="rounded-xl bg-[#111]/95 border border-white/10 px-3 py-2 shadow-xl text-xs">
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p) => <p key={p.name} className="flex items-center gap-2 text-white"><i className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}<span className="ml-auto pl-3 font-semibold tabular-nums">{f(p.value)}</span></p>)}
    </div>
  );
}
