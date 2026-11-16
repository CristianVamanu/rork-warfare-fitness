'use client';
export const dynamic = 'force-dynamic';

/**
 * /admin/finance: the financial command centre. Overview, customers &
 * payers, transactions, subscriptions, failed payments, refunds & disputes,
 * reports and forecasting, all for one currency at a time over a global
 * date range. Data comes from /api/admin/finance (admin-only, server-side);
 * see docs/FINANCE.md for every definition.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { RefreshCw, Database } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminGroups, ADMIN_ROUTE_TABS } from '@/components/admin/nav';
import { Segmented } from '@/components/admin/ui';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RangePicker, presetRange, PRESETS, useFinance, authedFetch, selectCls, date, type Range } from '@/components/admin/finance/kit';
import { Overview } from '@/components/admin/finance/Overview';
import { Customers } from '@/components/admin/finance/Customers';
import { Transactions, Subscriptions, Recovery, Refunds } from '@/components/admin/finance/Ledgers';
import { Forecast, Reports } from '@/components/admin/finance/Planning';

type View = 'overview' | 'customers' | 'transactions' | 'subscriptions' | 'failed' | 'refunds' | 'reports' | 'forecast';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'customers', label: 'Customers & payers' }, { id: 'transactions', label: 'Transactions' },
  { id: 'subscriptions', label: 'Subscriptions' }, { id: 'failed', label: 'Failed payments' }, { id: 'refunds', label: 'Refunds & disputes' },
  { id: 'reports', label: 'Revenue reports' }, { id: 'forecast', label: 'Forecasting' },
];

function FinancePage() {
  const router = useRouter(); const sp = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>((VIEWS.find((v) => v.id === sp.get('view'))?.id) ?? 'overview');
  const [range, setRange] = useState<Range>(() => presetRange('30d'));
  const [cur, setCur] = useState('');
  const [syncing, setSyncing] = useState(false); const [askFull, setAskFull] = useState(false);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  useEffect(() => { if (!authLoading && profile && profile.role !== 'admin') router.replace('/dashboard'); }, [authLoading, profile, router]);
  useEffect(() => {
    const q = new URLSearchParams(sp.toString()); q.set('view', view); router.replace(`/admin/finance?${q}`, { scroll: false });
    // Only the view drives the URL; re-running on router/params changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Currencies and sync state come with any view; the overview call is cheap enough to reuse.
  const head = useFinance<{ currency: string; currencies: string[]; needsSync: boolean; meta: { lastSyncAt: number | null; lastFullSyncAt: number | null; lastError: string | null }; plans: { plan: string }[] }>({ view: 'overview', from: range.from, to: range.to, tz, cur }, [syncing]);
  const currency = cur || head.data?.currency || '';
  const params = { from: range.from, to: range.to, tz, ...(currency ? { cur: currency } : {}) };
  const [epoch, setEpoch] = useState(0);

  const sync = async (full: boolean) => {
    if (!user) return;
    setSyncing(true); setAskFull(false);
    try {
      const res = await authedFetch(user, '/api/admin/finance/sync', { method: 'POST', body: JSON.stringify({ full }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Sync failed');
      const n = Object.values(j.counts as Record<string, number>).reduce((a, b) => a + b, 0);
      toast.success(`${j.full ? 'Full sync' : 'Sync'} complete · ${n.toLocaleString()} records`);
      setEpoch((e) => e + 1);
    } catch (e) { toast.error((e as Error).message); } finally { setSyncing(false); }
  };

  if (authLoading || !profile || profile.role !== 'admin') return null;
  const rangeLabel = range.preset === 'custom' ? `${date(range.from)} – ${date(range.to - 1)}` : PRESETS.find((p) => p[0] === range.preset)?.[1] ?? '';
  const m = head.data?.meta;

  return (
    <AdminShell groups={adminGroups()} active={'finance' as const} onSelect={(id) => { const r = ADMIN_ROUTE_TABS[id]; router.push(r ?? `/admin?tab=${id}`); }}
      title="Financials" subtitle={m?.lastSyncAt ? `Stripe synced ${date(m.lastSyncAt, true)}` : 'Stripe not synced yet'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker value={range} onChange={setRange} />
            {(head.data?.currencies?.length ?? 0) > 1 && (
              <select aria-label="Currency" value={currency} onChange={(e) => setCur(e.target.value)} className={selectCls}>
                {head.data!.currencies.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            )}
            {currency && <span className="text-[11px] text-text-tertiary">All figures in {currency.toUpperCase()} · {tz}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => sync(false)} loading={syncing}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync</Button>
            <Button size="sm" variant="ghost" onClick={() => setAskFull(true)} disabled={syncing}><Database className="w-3.5 h-3.5 mr-1.5" />Full resync</Button>
          </div>
        </div>
        {head.data?.needsSync && (
          <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-bold text-white">Import your payment history</p><p className="text-xs text-text-secondary">Copies customers, subscriptions, invoices, charges, refunds and disputes from Stripe. Safe to run again; nothing is changed in Stripe.</p></div>
            <Button size="sm" onClick={() => sync(true)} loading={syncing}>Import from Stripe</Button>
          </div>
        )}
        {m?.lastError && <p className="text-xs text-danger">Last sync error: {m.lastError}</p>}
        <div className="overflow-x-auto -mx-1 px-1"><Segmented value={view} onChange={setView} options={VIEWS} /></div>
        <div key={`${view}-${epoch}-${currency}`}>
          {!currency && !head.data ? null : view === 'overview' ? <Overview params={params} />
            : view === 'customers' ? <Customers params={params} />
            : view === 'transactions' ? <Transactions params={params} plans={(head.data?.plans ?? []).map((p) => p.plan)} />
            : view === 'subscriptions' ? <Subscriptions params={params} />
            : view === 'failed' ? <Recovery params={params} />
            : view === 'refunds' ? <Refunds params={params} />
            : view === 'reports' ? <Reports params={params} rangeLabel={rangeLabel} />
            : <Forecast params={params} />}
        </div>
      </div>
      <Modal open={askFull} onClose={() => setAskFull(false)} title="Full resync from Stripe"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAskFull(false)}>Cancel</Button><Button onClick={() => sync(true)} loading={syncing}>Resync everything</Button></div>}>
        <p className="text-sm text-text-secondary">Re-reads your entire Stripe history. It only reads from Stripe and overwrites the mirror record by record, so totals cannot double. It can take a few minutes on a long history.</p>
      </Modal>
    </AdminShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><FinancePage /></Suspense>;
}
