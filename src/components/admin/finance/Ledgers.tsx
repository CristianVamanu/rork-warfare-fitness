'use client';

import { useState } from 'react';
import { Search, Receipt, Repeat, AlertTriangle, RotateCcw, ExternalLink, ShieldAlert } from 'lucide-react';
import { Panel } from '@/components/admin/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { money, pct, date, Status, Table, Th, td, Pager, Empty, ErrorBox, useFinance, selectCls, inputCls, Field, Kpi, GridSkeleton } from './kit';
import { CustomerProfile } from './Customers';

const Rows = ({ n = 8 }) => <div className="space-y-2">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
const TYPES = [['', 'All types'], ['initial', 'Initial subscription'], ['renewal', 'Renewal'], ['plan_change', 'Plan change'], ['one_time', 'One-time'], ['refund', 'Refund'], ['failed', 'Failed'], ['chargeback', 'Chargeback']];
const TX_STATUS = [['', 'All statuses'], ['succeeded', 'Succeeded'], ['failed', 'Failed'], ['pending', 'Pending'], ['refunded', 'Refunded'], ['partially_refunded', 'Part refunded'], ['disputed', 'Disputed']];

// ---------- transactions ----------
interface Tx { id: string; at: number; customer: string | null; customerName: string | null; customerEmail: string | null; type: string; description: string; amount: number; currency: string; status: string; provider: string; reference: string | null; pm: string | null; failure: string | null }
export function Transactions({ params, plans }: { params: Record<string, string | number>; plans: string[] }) {
  const [q, setQ] = useState(''); const [qd, setQd] = useState(''); const [type, setType] = useState(''); const [status, setStatus] = useState(''); const [plan, setPlan] = useState(''); const [pm, setPm] = useState('');
  const [sort, setSort] = useState('date'); const [dir, setDir] = useState<'asc' | 'desc'>('desc'); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useFinance<{ currency: string; total: number; page: number; pageSize: number; rows: Tx[]; totals: { in: number; out: number } }>({ ...params, view: 'transactions', q: qd, type, status, plan, pm, sort, dir, page });
  const onSort = (k: string) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('desc'); } setPage(1); };
  const reset = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => { f(e.target.value); setPage(1); };
  return (
    <Panel title="All transactions" icon={Receipt} action={data ? <span className="text-xs text-text-secondary">In {money(data.totals.in, data.currency)} · refunded {money(data.totals.out, data.currency)}</span> : null}>
      <Field>
        <form onSubmit={(e) => { e.preventDefault(); setQd(q); setPage(1); }} className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { setQd(q); setPage(1); }} placeholder="Search customer, email, transaction or reference" className={`${inputCls} w-full pl-8`} />
        </form>
        <select aria-label="Type" value={type} onChange={reset(setType)} className={selectCls}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Status" value={status} onChange={reset(setStatus)} className={selectCls}>{TX_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Plan" value={plan} onChange={reset(setPlan)} className={selectCls}><option value="">All plans</option>{plans.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select aria-label="Payment method" value={pm} onChange={reset(setPm)} className={selectCls}><option value="">All methods</option>{['visa', 'mastercard', 'amex', 'apple_pay', 'google_pay', 'link', 'paypal'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select>
      </Field>
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Rows /> : !data.rows.length ? <Empty title="No transactions in this range" /> : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Table minWidth={1300} head={<><Th sort="date" onSort={onSort} active={sort === 'date'} dir={dir}>Date</Th><Th>Customer</Th><Th>Transaction ID</Th><Th>Description</Th><Th right sort="amount" onSort={onSort} active={sort === 'amount'} dir={dir}>Amount</Th><Th sort="status" onSort={onSort} active={sort === 'status'} dir={dir}>Status</Th><Th>Provider</Th><Th>Method</Th><Th>Reference</Th></>}>
            {data.rows.map((t) => (
              <tr key={t.id} onClick={() => t.customer && setOpen(t.customer)} className={t.customer ? 'cursor-pointer hover:bg-white/[0.03]' : ''}>
                <td className={td}>{date(t.at, true)}</td>
                <td className={td}><p className="font-semibold text-white">{t.customerName || '—'}</p><p className="text-[11px] text-text-tertiary">{t.customerEmail || t.customer || ''}</p></td>
                <td className={`${td} font-mono text-[11px]`}>{t.id}</td>
                <td className={td}>{t.description}{t.failure ? <p className="text-[11px] text-danger">{t.failure}</p> : null}</td>
                <td className={`${td} text-right tabular-nums font-semibold ${t.amount < 0 ? 'text-danger' : 'text-white'}`}>{money(t.amount, t.currency)} <span className="text-[10px] text-text-tertiary">{t.currency.toUpperCase()}</span></td>
                <td className={td}><Status s={t.status} /></td><td className={`${td} capitalize`}>{t.provider.replace('_', ' ')}</td><td className={`${td} capitalize`}>{t.pm ?? '—'}</td><td className={`${td} text-[11px]`}>{t.reference ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
      <CustomerProfile id={open} params={params} onClose={() => setOpen(null)} onChanged={reload} />
    </Panel>
  );
}

// ---------- subscriptions ----------
type SubRow = { id: string; customer: string; name: string | null; email: string | null; plan: string; status: string; renews: number | null; endsAt: number | null };
interface Subs {
  currency: string;
  counts: Record<'total' | 'active' | 'trialing' | 'newInPeriod' | 'cancelledInPeriod' | 'dueRenewal7d' | 'expiringSoon' | 'failedRecurring' | 'cancelledWithAccess', number>;
  plans: { plan: string; price: number; interval: string; active: number; mrr: number; arr: number; newSubs: number; cancels: number; churnRate: number | null }[];
  dueRenewal: SubRow[]; cancelledWithAccess: SubRow[]; planMembers?: SubRow[];
}
export function Subscriptions({ params }: { params: Record<string, string | number> }) {
  const [plan, setPlan] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useFinance<Subs>({ ...params, view: 'subscriptions', plan });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <GridSkeleton n={8} />;
  const c = data.counts, cur = data.currency;
  const list = (rows: SubRow[], dateLabel: string, key: 'renews' | 'endsAt') => rows.length ? (
    <Table minWidth={640} head={<><Th>Customer</Th><Th>Plan</Th><Th>Status</Th><Th>{dateLabel}</Th></>}>
      {rows.map((r) => <tr key={r.id} onClick={() => setOpen(r.customer)} className="cursor-pointer hover:bg-white/[0.03]"><td className={td}><p className="font-semibold text-white">{r.name || '—'}</p><p className="text-[11px] text-text-tertiary">{r.email || r.customer}</p></td><td className={td}>{r.plan}</td><td className={td}><Status s={r.status} /></td><td className={td}>{date(r[key])}</td></tr>)}
    </Table>
  ) : <Empty title="None right now" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {([['Total', c.total], ['Active', c.active], ['On trial', c.trialing], ['New (period)', c.newInPeriod], ['Ended (period)', c.cancelledInPeriod], ['Renewing ≤ 7 days', c.dueRenewal7d], ['Expiring ≤ 30 days', c.expiringSoon], ['Failed recurring', c.failedRecurring]] as [string, number][]).map(([l, v]) => <Kpi key={l} label={l} value={v.toLocaleString()} tone={l === 'Failed recurring' && v ? 'alert' : undefined} />)}
      </div>
      <Panel title="Plans" icon={Repeat}>
        {data.plans.length ? (
          <Table minWidth={900} head={<><Th>Plan</Th><Th right>Price</Th><Th>Interval</Th><Th right>Active</Th><Th right>Monthly revenue</Th><Th right>Annual revenue</Th><Th right>New</Th><Th right>Cancelled</Th><Th right>Churn</Th></>}>
            {data.plans.map((p) => (
              <tr key={p.plan} onClick={() => setPlan(plan === p.plan ? '' : p.plan)} className={`cursor-pointer hover:bg-white/[0.03] ${plan === p.plan ? 'bg-accent/5' : ''}`}>
                <td className={`${td} font-semibold text-white`}>{p.plan}</td><td className={`${td} text-right tabular-nums`}>{money(p.price, cur)}</td><td className={`${td} capitalize`}>{p.interval}</td>
                <td className={`${td} text-right tabular-nums`}>{p.active}</td><td className={`${td} text-right tabular-nums text-white font-semibold`}>{money(p.mrr, cur)}</td><td className={`${td} text-right tabular-nums`}>{money(p.arr, cur)}</td>
                <td className={`${td} text-right tabular-nums text-success`}>{p.newSubs}</td><td className={`${td} text-right tabular-nums text-danger`}>{p.cancels}</td><td className={`${td} text-right tabular-nums`}>{pct(p.churnRate)}</td>
              </tr>
            ))}
          </Table>
        ) : <Empty title="No subscription plans yet" />}
        <p className="text-[11px] text-text-tertiary">Click a plan to list its subscribers.</p>
      </Panel>
      {plan && data.planMembers && <Panel title={`Subscribers · ${plan}`} action={<button onClick={() => setPlan('')} className="text-xs font-semibold text-accent">Close</button>}>{list(data.planMembers, 'Renews', 'renews')}</Panel>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Renewing in the next 7 days" icon={Repeat}>{list(data.dueRenewal, 'Renews', 'renews')}</Panel>
        <Panel title="Cancelled, still has paid access" icon={ShieldAlert} action={<span className="text-xs text-text-secondary">{c.cancelledWithAccess}</span>}>{list(data.cancelledWithAccess, 'Access ends', 'endsAt')}</Panel>
      </div>
      <CustomerProfile id={open} params={params} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

// ---------- failed payments & recovery ----------
interface Rec {
  currency: string;
  summary: { failedCount: number; failedAmount: number; recoveredAmount: number; recoveredCount: number; outstanding: number; awaitingRetry: number; affected: number; lostAmount: number; rate: number | null };
  outstanding: { invoice: string; number: string | null; customer: string | null; name: string | null; email: string | null; owed: number; failedAt: number; reason: string | null; attempts: number; retry: string; nextRetry: number | null; subscriptionStatus: string | null; stripeUrl: string }[];
  failed: { id: string; at: number; customer: string | null; name: string | null; email: string | null; amount: number; reason: string | null }[];
}
export function Recovery({ params }: { params: Record<string, string | number> }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useFinance<Rec>({ ...params, view: 'recovery' });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <GridSkeleton n={6} />;
  const s = data.summary, cur = data.currency;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Failed (period)" value={s.failedCount.toLocaleString()} tone="alert" sub={money(s.failedAmount, cur)} />
        <Kpi label="Outstanding now" value={money(s.outstanding, cur)} tone="alert" sub="Unpaid after a failed attempt" />
        <Kpi label="Customers affected" value={s.affected} />
        <Kpi label="Awaiting retry" value={s.awaitingRetry} sub="Stripe has a retry scheduled" />
        <Kpi label="Recovered (period)" value={money(s.recoveredAmount, cur)} tone="signal" sub={`${s.recoveredCount} invoices paid after a retry`} />
        <Kpi label="Recovery rate" value={pct(s.rate)} sub={s.lostAmount ? `${money(s.lostAmount, cur)} written off` : 'Recovered ÷ (recovered + outstanding + lost)'} />
      </div>
      <Panel title="Revenue at risk" icon={AlertTriangle} action={<span className="text-xs text-text-secondary">Nothing here charges a customer; retries are Stripe&apos;s own schedule.</span>}>
        {data.outstanding.length ? (
          <Table minWidth={1100} head={<><Th>Customer</Th><Th right>Owed</Th><Th>Failed</Th><Th>Reason</Th><Th right>Attempts</Th><Th>Retry</Th><Th>Next retry</Th><Th>Subscription</Th><Th> </Th></>}>
            {data.outstanding.map((r) => (
              <tr key={r.invoice}>
                <td className={td}><button onClick={() => r.customer && setOpen(r.customer)} className="text-left"><p className="font-semibold text-white hover:underline">{r.name || '—'}</p><p className="text-[11px] text-text-tertiary">{r.email || r.customer}</p></button></td>
                <td className={`${td} text-right tabular-nums font-semibold text-danger`}>{money(r.owed, cur)}</td><td className={td}>{date(r.failedAt, true)}</td>
                <td className={`${td} max-w-[260px] truncate`} title={r.reason ?? ''}>{r.reason ?? '—'}</td><td className={`${td} text-right tabular-nums`}>{r.attempts}</td>
                <td className={`${td} capitalize`}>{r.retry}</td><td className={td}>{date(r.nextRetry, true)}</td><td className={td}><Status s={r.subscriptionStatus} /></td>
                <td className={td}><a href={r.stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline">Stripe <ExternalLink className="w-3 h-3" /></a></td>
              </tr>
            ))}
          </Table>
        ) : <Empty title="No outstanding failed payments" body="Every invoice with a failed attempt has since been paid, voided or written off." />}
      </Panel>
      <Panel title="Failed charges in this period" icon={AlertTriangle}>
        {data.failed.length ? (
          <Table minWidth={760} head={<><Th>Date</Th><Th>Customer</Th><Th right>Amount</Th><Th>Reason</Th></>}>
            {data.failed.map((f) => <tr key={f.id} onClick={() => f.customer && setOpen(f.customer)} className="cursor-pointer hover:bg-white/[0.03]"><td className={td}>{date(f.at, true)}</td><td className={td}><p className="font-semibold text-white">{f.name || '—'}</p><p className="text-[11px] text-text-tertiary">{f.email || f.customer}</p></td><td className={`${td} text-right tabular-nums`}>{money(f.amount, cur)}</td><td className={td}>{f.reason ?? '—'}</td></tr>)}
          </Table>
        ) : <Empty title="No failed charges in this period" />}
      </Panel>
      <CustomerProfile id={open} params={params} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

// ---------- refunds & disputes ----------
type RD = { id: string; charge: string | null; amount: number; currency: string; status: string; reason: string | null; created: number; customer: string | null; name: string | null; email: string | null; chargeAmount: number | null; chargeAt: number | null };
interface Refs { currency: string; summary: { total: number; period: number; pct: number | null; thisMonth: number; pending: number; completed: number; disputesOpen: number; disputesLost: number }; reasons: Record<string, number>; refunds: RD[]; disputes: RD[] }
export function Refunds({ params }: { params: Record<string, string | number> }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useFinance<Refs>({ ...params, view: 'refunds' });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <GridSkeleton n={6} />;
  const s = data.summary, cur = data.currency;
  const table = (rows: RD[], kind: string) => rows.length ? (
    <Table minWidth={980} head={<><Th>Date</Th><Th>Customer</Th><Th>{kind} ID</Th><Th>Original charge</Th><Th right>Charge</Th><Th right>{kind}</Th><Th>Status</Th><Th>Reason</Th></>}>
      {rows.map((r) => <tr key={r.id} onClick={() => r.customer && setOpen(r.customer)} className="cursor-pointer hover:bg-white/[0.03]">
        <td className={td}>{date(r.created, true)}</td><td className={td}><p className="font-semibold text-white">{r.name || '—'}</p><p className="text-[11px] text-text-tertiary">{r.email || r.customer || ''}</p></td>
        <td className={`${td} font-mono text-[11px]`}>{r.id}</td><td className={`${td} font-mono text-[11px]`}>{r.charge ?? '—'}<p className="font-sans text-text-tertiary">{date(r.chargeAt)}</p></td>
        <td className={`${td} text-right tabular-nums`}>{r.chargeAmount != null ? money(r.chargeAmount, cur) : '—'}</td><td className={`${td} text-right tabular-nums font-semibold text-danger`}>{money(r.amount, cur)}</td>
        <td className={td}><Status s={r.status} /></td><td className={`${td} capitalize`}>{r.reason?.replace(/_/g, ' ') ?? '—'}</td></tr>)}
    </Table>
  ) : <Empty title={`No ${kind.toLowerCase()}s`} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Refunded · period" value={money(s.period, cur)} tone="alert" sub={`${pct(s.pct)} of gross`} />
        <Kpi label="This month" value={money(s.thisMonth, cur)} /><Kpi label="All time" value={money(s.total, cur)} />
        <Kpi label="Completed" value={s.completed} /><Kpi label="Pending" value={s.pending} />
        <Kpi label="Open disputes" value={s.disputesOpen} tone={s.disputesOpen ? 'alert' : undefined} sub={s.disputesLost ? `Lost in period ${money(s.disputesLost, cur)}` : undefined} />
      </div>
      {Object.keys(data.reasons).length > 0 && (
        <Panel title="Refund reasons · period" icon={RotateCcw}>
          <div className="flex flex-wrap gap-2">{Object.entries(data.reasons).sort((a, b) => b[1] - a[1]).map(([r, v]) => <span key={r} className="px-3 py-1.5 rounded-full bg-surface-elevated text-xs capitalize"><b className="text-white">{money(v, cur)}</b> <span className="text-text-secondary">{r.replace(/_/g, ' ')}</span></span>)}</div>
        </Panel>
      )}
      <Panel title="Refunds" icon={RotateCcw} action={<span className="text-xs text-text-secondary">Issue a refund from the customer&apos;s payment history</span>}>{table(data.refunds, 'Refund')}</Panel>
      <Panel title="Disputes & chargebacks" icon={ShieldAlert}>{table(data.disputes, 'Dispute')}</Panel>
      <CustomerProfile id={open} params={params} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}
