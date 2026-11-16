'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Search, ExternalLink, RotateCcw, User, CalendarClock, Wallet, Clock } from 'lucide-react';
import { Panel, KV } from '@/components/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { minorExponent } from '@/lib/finance/money';
import { money, date, Status, Table, Th, td, Pager, Empty, ErrorBox, useFinance, selectCls, inputCls, Field, authedFetch } from './kit';

interface Row {
  id: string; uid: string | null; name: string | null; email: string | null; country: string | null; currency: string | null;
  plan: string | null; price: number | null; interval: string | null; startDate: number | null; nextBilling: number | null;
  lastPayment: number | null; totalPaid: number; refunded: number; payments: number; failed: number; ltv: number; status: string; pm: string | null; cancelledAt: number | null;
}
const STATUSES = [['', 'All statuses'], ['active', 'Active'], ['cancelling', 'Cancelling'], ['trial', 'Trial'], ['past_due', 'Past due'], ['payment_failed', 'Payment failed'], ['cancelled', 'Cancelled'], ['expired', 'Expired'], ['incomplete', 'Incomplete'], ['paused', 'Paused'], ['one_time', 'One-time']];

export function Customers({ params, initialPlan }: { params: Record<string, string | number>; initialPlan?: string }) {
  const [q, setQ] = useState(''); const [qd, setQd] = useState('');
  const [status, setStatus] = useState(''); const [plan, setPlan] = useState(initialPlan ?? '');
  const [sort, setSort] = useState('ltv'); const [dir, setDir] = useState<'asc' | 'desc'>('desc'); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useFinance<{ currency: string; total: number; page: number; pageSize: number; rows: Row[] }>({ ...params, view: 'customers', q: qd, status, plan, sort, dir, page });
  const onSort = (k: string) => { if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('desc'); } setPage(1); };
  const cur = data?.currency ?? 'gbp';

  return (
    <Panel title="Customers & payers" icon={User} action={<span className="text-xs text-text-secondary">{data ? `${data.total.toLocaleString()} customers` : ''}</span>}>
      <Field>
        <form onSubmit={(e) => { e.preventDefault(); setQd(q); setPage(1); }} className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { setQd(q); setPage(1); }} placeholder="Search name, email or customer ID" className={`${inputCls} w-full pl-8`} />
        </form>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {plan && <button onClick={() => setPlan('')} className="text-xs font-semibold text-accent">Plan: {plan} ✕</button>}
      </Field>
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : !data.rows.length ? <Empty title="No customers match" body="Paying customers appear here once Stripe has processed a payment or subscription." /> : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Table minWidth={1500} head={<>
            <Th sort="name" onSort={onSort} active={sort === 'name'} dir={dir}>Customer</Th><Th>Plan</Th><Th right sort="price" onSort={onSort} active={sort === 'price'} dir={dir}>Price</Th><Th>Billing</Th>
            <Th sort="startDate" onSort={onSort} active={sort === 'startDate'} dir={dir}>Started</Th><Th sort="nextBilling" onSort={onSort} active={sort === 'nextBilling'} dir={dir}>Next billing</Th>
            <Th sort="lastPayment" onSort={onSort} active={sort === 'lastPayment'} dir={dir}>Last payment</Th><Th right sort="totalPaid" onSort={onSort} active={sort === 'totalPaid'} dir={dir}>Total paid</Th>
            <Th right sort="payments" onSort={onSort} active={sort === 'payments'} dir={dir}>Payments</Th><Th right sort="ltv" onSort={onSort} active={sort === 'ltv'} dir={dir}>LTV (net)</Th>
            <Th>Status</Th><Th>Method</Th><Th>Country</Th><Th>Cancelled</Th>
          </>}>
            {data.rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} className="cursor-pointer hover:bg-white/[0.03] transition-colors">
                <td className={td}><p className="font-semibold text-white">{r.name || '—'}</p><p className="text-[11px] text-text-tertiary">{r.email || r.id}</p></td>
                <td className={`${td} text-white`}>{r.plan ?? '—'}</td>
                <td className={`${td} text-right tabular-nums`}>{r.price != null ? money(r.price, r.currency ?? cur) : '—'}</td>
                <td className={`${td} capitalize`}>{r.interval ? `per ${r.interval}` : '—'}</td>
                <td className={td}>{date(r.startDate)}</td><td className={td}>{date(r.nextBilling)}</td><td className={td}>{date(r.lastPayment)}</td>
                <td className={`${td} text-right tabular-nums text-white`}>{money(r.totalPaid, r.currency ?? cur)}</td>
                <td className={`${td} text-right tabular-nums`}>{r.payments}{r.failed ? <span className="text-danger"> · {r.failed}✕</span> : null}</td>
                <td className={`${td} text-right tabular-nums font-semibold text-accent`}>{money(r.ltv, r.currency ?? cur)}</td>
                <td className={td}><Status s={r.status} /></td><td className={`${td} capitalize`}>{r.pm ?? '—'}</td><td className={td}>{r.country ?? '—'}</td><td className={td}>{date(r.cancelledAt)}</td>
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

interface Profile {
  currency: string;
  customer: Row; registeredAt: number | null; links: { stripe: string };
  subscriptions: { id: string; plan: string; displayStatus: string; status: string; startDate: number; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean; canceledAt: number | null; endedAt: number | null; trialStart: number | null; trialEnd: number | null; items: { unitAmount: number; quantity: number; currency: string; interval: string; intervalCount: number }[] }[];
  transactions: { id: string; at: number; type: string; description: string; amount: number; currency: string; status: string; reference: string | null; pm: string | null; failure: string | null; chargeId: string | null; refundedAmount: number }[];
  timeline: { at: number; kind: string; label: string }[];
  summary: { collected: number; refunded: number; net: number; payments: number; failed: number; average: number; ltv: number; durationDays: number | null };
}

export function CustomerProfile({ id, params, onClose, onChanged }: { id: string | null; params: Record<string, string | number>; onClose: () => void; onChanged?: () => void }) {
  const { data, error, reload } = useFinance<Profile>(id ? { ...params, view: 'customer', id } : { view: 'customer', id: '' }, [id]);
  const [refund, setRefund] = useState<Profile['transactions'][number] | null>(null);
  const p = id && data?.customer?.id === id ? data : null;
  const cur = p?.customer.currency ?? p?.currency ?? 'gbp';
  return (
    <Modal open={!!id} onClose={onClose} title={p?.customer.name || p?.customer.email || 'Customer'} className="max-w-4xl">
      {error && id ? <ErrorBox error={error} onRetry={reload} /> : !p ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div> : (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KV k="Email" v={p.customer.email} /><KV k="Customer ID" v={p.customer.id} /><KV k="Registered" v={date(p.registeredAt)} /><KV k="Country" v={p.customer.country} />
            <KV k="Status" v={<Status s={p.customer.status} />} /><KV k="Plan" v={p.customer.plan} /><KV k="Price" v={p.customer.price != null ? `${money(p.customer.price, cur)} / ${p.customer.interval}` : '—'} /><KV k="Next renewal" v={date(p.customer.nextBilling)} />
          </section>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[['Collected', money(p.summary.collected, cur)], ['Refunded', money(p.summary.refunded, cur)], ['Net collected', money(p.summary.net, cur)], ['Lifetime value', money(p.summary.ltv, cur)],
              ['Successful payments', p.summary.payments], ['Failed payments', p.summary.failed], ['Average payment', money(p.summary.average, cur)], ['Customer for', p.summary.durationDays != null ? `${p.summary.durationDays} days` : '—']].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-surface-elevated px-3 py-2.5"><p className="text-[11px] text-text-secondary">{k}</p><p className="text-base font-extrabold text-white tabular-nums">{v}</p></div>
            ))}
          </section>
          {p.subscriptions.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />Subscriptions</h3>
              {p.subscriptions.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/8 p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="col-span-2 md:col-span-4 flex items-center justify-between"><span className="font-bold text-white">{s.plan}</span><Status s={s.displayStatus} /></div>
                  <span className="text-text-secondary">Started <b className="text-white font-semibold">{date(s.startDate)}</b></span>
                  <span className="text-text-secondary">{s.endedAt ? 'Ended' : 'Renews'} <b className="text-white font-semibold">{date(s.endedAt ?? s.currentPeriodEnd)}</b></span>
                  <span className="text-text-secondary">Trial <b className="text-white font-semibold">{s.trialStart ? `${date(s.trialStart)} – ${date(s.trialEnd)}` : '—'}</b></span>
                  <span className="text-text-secondary">Cancellation <b className="text-white font-semibold">{s.canceledAt ? `${date(s.canceledAt)}${s.cancelAtPeriodEnd ? ' (at period end)' : ' (immediate)'}` : s.cancelAtPeriodEnd ? 'Scheduled for period end' : '—'}</b></span>
                </div>
              ))}
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Timeline</h3>
            <ol className="relative border-l border-white/10 ml-1.5 flex flex-col gap-2.5">
              {p.timeline.map((e, i) => (
                <li key={i} className="pl-4 relative text-xs"><i className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ${e.kind === 'failed' || e.kind === 'refund' || e.kind === 'ended' ? 'bg-danger' : e.kind === 'first_payment' || e.kind === 'reactivated' ? 'bg-accent' : e.kind === 'scheduled' ? 'bg-info' : 'bg-white/30'}`} />
                  <span className="text-white font-semibold">{e.label}</span><span className="text-text-tertiary"> · {date(e.at, true)}</span></li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" />Payment history</h3>
            {p.transactions.length ? (
              <Table minWidth={860} head={<><Th>Date</Th><Th>Transaction</Th><Th>Description</Th><Th right>Amount</Th><Th>Status</Th><Th>Method</Th><Th>Reference</Th><Th> </Th></>}>
                {p.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className={td}>{date(t.at, true)}</td><td className={`${td} font-mono text-[11px]`}>{t.id}</td>
                    <td className={td}>{t.description}{t.failure ? <p className="text-[11px] text-danger">{t.failure}</p> : null}</td>
                    <td className={`${td} text-right tabular-nums ${t.amount < 0 ? 'text-danger' : 'text-white'}`}>{money(t.amount, t.currency)}{t.refundedAmount ? <p className="text-[11px] text-text-tertiary">{money(t.refundedAmount, t.currency)} refunded</p> : null}</td>
                    <td className={td}><Status s={t.status} /></td><td className={`${td} capitalize`}>{t.pm ?? '—'}</td><td className={`${td} text-[11px]`}>{t.reference ?? '—'}</td>
                    <td className={td}>{t.chargeId && (t.status === 'succeeded' || t.status === 'partially_refunded') && t.amount - t.refundedAmount > 0 && t.type !== 'refund' ? <button onClick={() => setRefund(t)} className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"><RotateCcw className="w-3 h-3" />Refund</button> : null}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty title="No transactions" />}
          </section>
          <a href={p.links.stripe} target="_blank" rel="noopener noreferrer" className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">Open in Stripe <ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
      )}
      <RefundDialog tx={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); reload(); onChanged?.(); }} />
    </Modal>
  );
}

function RefundDialog({ tx, onClose, onDone }: { tx: Profile['transactions'][number] | null; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const max = tx ? tx.amount - tx.refundedAmount : 0;
  const exp = tx ? minorExponent(tx.currency) : 2;
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState('requested_by_customer'); const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false); const [reqId] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())));
  const minor = Math.round(Number(amount || (max / 10 ** exp)) * 10 ** exp);
  const valid = Number.isInteger(minor) && minor > 0 && minor <= max && typed === 'REFUND';
  const submit = async () => {
    if (!user || !tx || !valid) return;
    setBusy(true);
    try {
      const res = await authedFetch(user, '/api/admin/finance/refund', { method: 'POST', body: JSON.stringify({ chargeId: tx.chargeId, amount: minor, reason, confirm: 'REFUND', requestId: reqId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Refund failed');
      toast.success(`Refund ${j.refund?.status === 'succeeded' ? 'issued' : 'submitted'}: ${money(minor, tx.currency)}`);
      setAmount(''); setTyped(''); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!tx} onClose={onClose} title="Refund payment" dismissOnOverlay={false}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={submit} loading={busy} disabled={!valid}>Refund {tx && minor > 0 ? money(minor, tx.currency) : ''}</Button></div>}>
      {tx && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-text-secondary">Charge <span className="font-mono text-white">{tx.chargeId}</span> on {date(tx.at)} for <b className="text-white">{money(tx.amount, tx.currency)}</b>. Up to <b className="text-white">{money(max, tx.currency)}</b> can still be refunded. A full refund also ends the access this payment bought.</p>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">Amount ({tx.currency.toUpperCase()})
            <input inputMode="decimal" value={amount} placeholder={(max / 10 ** exp).toFixed(exp)} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className={`${inputCls} rounded-xl`} />
            {minor > max && <span className="text-danger">More than the refundable amount.</span>}
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${selectCls} rounded-xl`}><option value="requested_by_customer">Requested by customer</option><option value="duplicate">Duplicate</option><option value="fraudulent">Fraudulent</option></select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">Type REFUND to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} className={`${inputCls} rounded-xl`} />
          </label>
          <p className="text-[11px] text-text-tertiary">Sent to Stripe once, with an idempotency key, and recorded in the finance audit log under your account.</p>
        </div>
      )}
    </Modal>
  );
}
