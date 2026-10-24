'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Check, X, Pause, Play, Search, Plus, Trash2, Wallet, Save, ShieldAlert, ExternalLink, RefreshCw, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminGroups, ADMIN_ROUTE_TABS } from '@/components/admin/nav';
import { StatTile, Panel, Pill, Segmented, KV } from '@/components/admin/ui';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCents, FLAG_LABELS, type PartnerProgramConfig, type Balance } from '@/lib/partners';

/**
 * /admin/partners — the whole partner program on one screen: numbers,
 * applications, every partner with controls, the review queue, payouts,
 * settings and the resources partners see. Data comes from
 * /api/admin/partners (one GET) and changes go through the sibling routes.
 */

type View = 'overview' | 'applications' | 'partners' | 'review' | 'payouts' | 'settings' | 'resources';

interface PartnerRow {
  uid: string; code: string; status: string; profile: { name: string; email: string; channels: string; audience: string; about: string; website?: string };
  percent: number; percentOverride: number | null; capMonths: number; capMonthsOverride: number | null;
  connect: boolean; connectReady: boolean; membershipGranted: boolean; notes: string; createdAt: string | null; reviewedAt: string | null; agreementVersion: number;
  stats: { clicks: number; signups: number; members: number; revenueCents: number; conversion: number }; balance: Balance; reviewCount: number;
}
interface ReviewRow { id: string; partnerId: string; partnerCode: string; memberUid: string; commissionCents: number; grossCents: number; flags: string[]; createdAt: string | null; planName: string | null }
interface Payout { id: string; partnerId: string; partnerCode: string; amountCents: number; currency: string; status: string; method: string; period: string; createdAt: string | null; transferId: string | null }
interface Resource { title: string; url: string; kind: string; description: string }
interface Tip { title: string; body: string }
interface Data {
  config: PartnerProgramConfig;
  program: Balance & { partners: number; applications: number; clicks: number; signups: number; members: number; revenueCents: number; monthRevenueCents: number; monthCommissionCents: number };
  partners: PartnerRow[]; review: ReviewRow[]; payouts: Payout[]; resources: Resource[]; tips: Tip[];
}
interface Detail {
  partner: PartnerRow & { decisionReason?: string; connectAccountId?: string | null };
  account: { email: string | null; displayName: string | null; membership: string };
  balance: Balance;
  ledger: { id: string; status: string; storedStatus: string; commissionCents: number; grossCents: number; netCents: number; percent: number; flags: string[]; createdAt: string | null; holdUntil: string | null; planName: string | null; note: string | null; memberEmail: string | null; payoutId: string | null }[];
  members: { uid: string; email: string | null; name: string | null; joinedAt: string | null; status: string; plan: string | null; source: string | null }[];
}

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const STATUS_PILL: Record<string, 'ok' | 'accent' | 'muted' | 'danger' | 'info'> = { active: 'ok', applied: 'accent', suspended: 'danger', rejected: 'muted' };

export default function AdminPartnersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<View>('overview');
  const [q, setQ] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [cfgForm, setCfgForm] = useState<PartnerProgramConfig | null>(null);
  const [resForm, setResForm] = useState<{ items: Resource[]; tips: Tip[] } | null>(null);
  const [decision, setDecision] = useState<{ uid: string; status: 'rejected' | 'suspended'; reason: string } | null>(null);
  const [adjust, setAdjust] = useState<{ uid: string; amount: string; note: string } | null>(null);
  const [payoutRun, setPayoutRun] = useState<{ results: { code: string; amountCents: number; outcome: string }[]; dryRun: boolean } | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    if (!user) throw new Error('not signed in');
    const token = await getIdToken(user);
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  }, [user]);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/admin/partners') as Data;
      setData(d);
      setCfgForm((f) => f ?? d.config);
      setResForm((f) => f ?? { items: d.resources, tips: d.tips });
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load'); }
  }, [api]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const openDetail = useCallback(async (uid: string) => {
    setDetailId(uid); setDetail(null);
    try { setDetail(await api(`/api/admin/partners/${uid}`) as Detail); } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); setDetailId(null); }
  }, [api]);

  const update = async (uid: string, body: Record<string, unknown>, ok = 'Saved') => {
    setBusy(true);
    try { await api(`/api/admin/partners/${uid}`, { method: 'POST', body: JSON.stringify(body) }); toast.success(ok); await load(); if (detailId === uid) await openDetail(uid); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const reviewRow = async (id: string, action: 'approve' | 'reject') => {
    setBusy(true);
    try { await api('/api/admin/partners/ledger', { method: 'POST', body: JSON.stringify({ id, action }) }); toast.success(action === 'approve' ? 'Approved' : 'Rejected'); await load(); if (detailId) await openDetail(detailId); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const runPayouts = async (dryRun: boolean, partnerId?: string) => {
    setBusy(true);
    try {
      const r = await api('/api/admin/partners/payouts', { method: 'POST', body: JSON.stringify({ dryRun, partnerId }) }) as { results: { code: string; amountCents: number; outcome: string }[] };
      setPayoutRun({ results: r.results, dryRun });
      if (!dryRun) { toast.success('Payout run finished'); await load(); }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const markPaid = async (payoutId: string) => {
    const reference = prompt('Bank reference (optional)') ?? '';
    setBusy(true);
    try { await api('/api/admin/partners/payouts', { method: 'PATCH', body: JSON.stringify({ payoutId, status: 'paid', reference }) }); toast.success('Marked paid'); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const saveSettings = async () => {
    if (!cfgForm) return;
    setBusy(true);
    try { const r = await api('/api/admin/partners/settings', { method: 'POST', body: JSON.stringify(cfgForm) }) as { config: PartnerProgramConfig }; setCfgForm(r.config); toast.success('Settings saved'); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const saveResources = async () => {
    if (!resForm) return;
    setBusy(true);
    try { await api('/api/admin/partners/resources', { method: 'POST', body: JSON.stringify(resForm) }); toast.success('Resources saved'); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };
  const submitAdjust = async () => {
    if (!adjust) return;
    const amountCents = Math.round(Number(adjust.amount) * 100);
    setBusy(true);
    try { await api('/api/admin/partners/ledger', { method: 'POST', body: JSON.stringify({ adjust: { partnerId: adjust.uid, amountCents, note: adjust.note } }) }); toast.success('Adjustment added'); setAdjust(null); await load(); if (detailId) await openDetail(detailId); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const partners = useMemo(() => {
    const list = data?.partners ?? [];
    const t = q.trim().toLowerCase();
    return t ? list.filter((p) => [p.code, p.profile?.name, p.profile?.email, p.profile?.channels].some((v) => (v ?? '').toLowerCase().includes(t))) : list;
  }, [data, q]);
  const applications = (data?.partners ?? []).filter((p) => p.status === 'applied');

  const VIEWS: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'applications', label: `Applications${applications.length ? ` (${applications.length})` : ''}` },
    { id: 'partners', label: 'Partners' },
    { id: 'review', label: `Review${data?.review.length ? ` (${data.review.length})` : ''}` },
    { id: 'payouts', label: 'Payouts' },
    { id: 'settings', label: 'Settings' },
    { id: 'resources', label: 'Resources' },
  ];

  return (
    <AdminShell
      groups={adminGroups()}
      active={'partners' as const}
      onSelect={(id) => { const route = ADMIN_ROUTE_TABS[id]; router.push(route ?? `/admin?tab=${id}`); }}
      title="Partners"
      subtitle={data ? `${data.program.partners} active · ${formatCents(data.program.revenueCents)} attributed revenue` : undefined}
    >
      <div className="space-y-5 max-w-[1180px]">
        <div className="flex items-center justify-between gap-3">
          {/* Scrolls sideways on a phone; seven tabs never fit in 360px. */}
          <div className="min-w-0 flex-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Segmented value={view} onChange={setView} options={VIEWS} className="flex-nowrap" />
          </div>
          <Button variant="ghost" size="sm" onClick={load} className="flex-shrink-0"><RefreshCw className="w-4 h-4" /><span className="hidden sm:inline"> Refresh</span></Button>
        </div>

        {view === 'overview' && data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Active partners" value={data.program.partners} caption={`${data.program.applications} waiting for review`} />
              <StatTile label="Clicks → members" value={`${data.program.clicks} → ${data.program.members}`} caption={`${data.program.signups} sign-ups in between`} />
              <StatTile label="Attributed revenue" value={formatCents(data.program.revenueCents)} caption={`${formatCents(data.program.monthRevenueCents)} this month`} />
              <StatTile label="Commission owed" value={formatCents(data.program.payableCents)} caption={`${formatCents(data.program.pendingCents + data.program.reviewCents)} pending · ${formatCents(data.program.paidCents)} paid`} />
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <Panel title="Needs you" icon={ShieldAlert}>
                <div className="space-y-2 text-sm">
                  <Row label="Applications to review" value={applications.length} onClick={() => setView('applications')} />
                  <Row label="Commissions flagged for review" value={data.review.length} onClick={() => setView('review')} />
                  <Row label="Manual payouts to send" value={data.payouts.filter((p) => p.status === 'manual_pending').length} onClick={() => setView('payouts')} />
                  <Row label="Partners without a payout account" value={data.partners.filter((p) => p.status === 'active' && !p.connectReady).length} onClick={() => setView('partners')} />
                </div>
              </Panel>
              <Panel title="Top partners" icon={Wallet}>
                <div className="divide-y divide-white/6">
                  {data.partners.filter((p) => p.status === 'active').slice(0, 6).map((p) => (
                    <button key={p.uid} onClick={() => openDetail(p.uid)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-white/5 rounded-lg px-1">
                      <span className="font-mono text-xs font-bold text-accent w-20 truncate">{p.code}</span>
                      <span className="flex-1 text-sm text-white truncate">{p.profile?.name}</span>
                      <span className="text-xs text-text-secondary">{p.stats.members} members</span>
                      <span className="text-sm font-bold text-white w-20 text-right">{formatCents(p.stats.revenueCents)}</span>
                    </button>
                  ))}
                  {!data.partners.some((p) => p.status === 'active') && <p className="text-xs text-text-secondary py-2">No active partners yet. Share /partners to get applications.</p>}
                </div>
              </Panel>
            </div>
          </>
        )}

        {view === 'applications' && (
          <div className="space-y-3">
            {applications.length === 0 && <Card className="p-6 text-center text-sm text-text-secondary">No applications waiting.</Card>}
            {applications.map((p) => (
              <Card key={p.uid} className="p-4 lg:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{p.profile?.name} <span className="font-mono text-accent ml-2">{p.code}</span></p>
                    <p className="text-xs text-text-secondary">{p.profile?.email} · applied {fmtDate(p.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => update(p.uid, { status: 'active' }, 'Approved and emailed')} disabled={busy}><Check className="w-4 h-4" /> Approve</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDecision({ uid: p.uid, status: 'rejected', reason: '' })} disabled={busy}><X className="w-4 h-4" /> Reject</Button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <KV k="Channels" v={p.profile?.channels} /><KV k="Audience" v={p.profile?.audience || '—'} /><KV k="Website" v={p.profile?.website ? <a href={p.profile.website} target="_blank" rel="noreferrer" className="underline">{p.profile.website}</a> : '—'} />
                </div>
                <p className="text-xs text-text-secondary whitespace-pre-wrap">{p.profile?.about}</p>
              </Card>
            ))}
          </div>
        )}

        {view === 'partners' && (
          <Panel title={`${partners.length} partners`} action={<div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 pl-9 pr-3 rounded-full bg-surface-elevated text-sm text-white outline-none w-48" /></div>}>
            <div className="overflow-x-auto -mx-4 lg:-mx-5">
              <table className="w-full text-sm min-w-[860px]">
                <thead><tr className="text-[11px] uppercase tracking-wider text-text-tertiary"><th className="text-left px-4 py-2">Partner</th><th className="text-left py-2">Status</th><th className="text-right py-2">%</th><th className="text-right py-2">Clicks</th><th className="text-right py-2">Sign-ups</th><th className="text-right py-2">Members</th><th className="text-right py-2">Conv.</th><th className="text-right py-2">Revenue</th><th className="text-right py-2">Owed</th><th className="text-right px-4 py-2">Flags</th></tr></thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.uid} onClick={() => openDetail(p.uid)} className="cursor-pointer hover:bg-white/5 border-t border-white/6">
                      <td className="px-4 py-2.5"><p className="text-white font-medium truncate max-w-[220px]">{p.profile?.name}</p><p className="font-mono text-xs text-accent">{p.code}</p></td>
                      <td className="py-2.5"><Pill tone={STATUS_PILL[p.status] ?? 'muted'}>{p.status}</Pill></td>
                      <td className="py-2.5 text-right text-white">{p.percent}{p.percentOverride !== null && <span className="text-text-tertiary">*</span>}</td>
                      <td className="py-2.5 text-right text-text-secondary">{p.stats.clicks}</td>
                      <td className="py-2.5 text-right text-text-secondary">{p.stats.signups}</td>
                      <td className="py-2.5 text-right text-white font-semibold">{p.stats.members}</td>
                      <td className="py-2.5 text-right text-text-secondary">{p.stats.conversion}%</td>
                      <td className="py-2.5 text-right text-white">{formatCents(p.stats.revenueCents)}</td>
                      <td className="py-2.5 text-right text-white">{formatCents(p.balance.payableCents)}</td>
                      <td className="px-4 py-2.5 text-right">{p.reviewCount > 0 ? <Pill tone="danger">{p.reviewCount}</Pill> : <span className="text-text-tertiary">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {view === 'review' && data && (
          <Panel title="Commissions held for review" icon={ShieldAlert}>
            {data.review.length === 0 ? <p className="text-sm text-text-secondary">Nothing flagged. Every held commission shows here with the reason.</p> : (
              <div className="divide-y divide-white/6">
                {data.review.map((r) => (
                  <div key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm text-white"><span className="font-mono text-accent">{r.partnerCode}</span> · {formatCents(r.commissionCents)} on {formatCents(r.grossCents)} · {fmtDate(r.createdAt)}</p>
                      <div className="flex flex-wrap gap-1 mt-1">{r.flags.map((f) => <Pill key={f} tone="danger">{FLAG_LABELS[f] ?? f}</Pill>)}</div>
                    </div>
                    <Button size="sm" onClick={() => reviewRow(r.id, 'approve')} disabled={busy}><Check className="w-4 h-4" /> Approve</Button>
                    <Button size="sm" variant="secondary" onClick={() => reviewRow(r.id, 'reject')} disabled={busy}><X className="w-4 h-4" /> Reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => openDetail(r.partnerId)}>Partner</Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {view === 'payouts' && data && (
          <div className="space-y-4">
            <Panel title="Payout run" icon={Wallet} action={<Pill tone={data.config.payoutMode === 'connect' ? 'ok' : 'accent'}>{data.config.payoutMode === 'connect' ? 'Stripe Connect' : 'Manual'}</Pill>}>
              <p className="text-sm text-text-secondary">Pays every active partner whose approved balance clears {formatCents(data.config.minPayoutCents)}. Preview first; nothing moves on a preview.</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => runPayouts(true)} disabled={busy}>Preview</Button>
                <Button onClick={() => { if (confirm('Run payouts now? Transfers are sent for connected partners.')) void runPayouts(false); }} disabled={busy}>Run payouts</Button>
              </div>
              {payoutRun && (
                <div className="rounded-xl bg-surface-elevated p-3 text-xs space-y-1">
                  <p className="font-bold text-white">{payoutRun.dryRun ? 'Preview' : 'Result'}</p>
                  {payoutRun.results.length === 0 && <p className="text-text-secondary">No active partners.</p>}
                  {payoutRun.results.map((r) => <p key={r.code} className="text-text-secondary"><span className="font-mono text-accent">{r.code}</span> {formatCents(r.amountCents)} — {r.outcome.replace(/_/g, ' ')}</p>)}
                </div>
              )}
            </Panel>
            <Panel title="Payout history">
              {data.payouts.length === 0 ? <p className="text-sm text-text-secondary">No payouts yet.</p> : (
                <div className="divide-y divide-white/6">
                  {data.payouts.map((po) => (
                    <div key={po.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="w-24 text-xs text-text-tertiary">{fmtDate(po.createdAt)}</span>
                      <span className="font-mono text-xs text-accent w-20 truncate">{po.partnerCode}</span>
                      <span className="flex-1 text-xs text-text-secondary">{po.period} · {po.method}{po.transferId ? ` · ${po.transferId}` : ''}</span>
                      <Pill tone={po.status === 'paid' ? 'ok' : po.status === 'failed' ? 'danger' : 'accent'}>{po.status.replace('_', ' ')}</Pill>
                      <span className="w-24 text-right font-bold text-white">{formatCents(po.amountCents, po.currency.toUpperCase())}</span>
                      {po.status === 'manual_pending' && <Button size="sm" variant="secondary" onClick={() => markPaid(po.id)} disabled={busy}>Mark paid</Button>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {view === 'settings' && cfgForm && (
          <Panel title="Program settings" action={<Button size="sm" onClick={saveSettings} disabled={busy}><Save className="w-4 h-4" /> Save</Button>}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Default commission (%)" type="number" min={0} max={90} value={cfgForm.defaultPercent} onChange={(e) => setCfgForm({ ...cfgForm, defaultPercent: Number(e.target.value) })} hint="Future invoices only. Per-partner overrides win." />
              <Input label="Hold period (days)" type="number" min={0} max={180} value={cfgForm.holdDays} onChange={(e) => setCfgForm({ ...cfgForm, holdDays: Number(e.target.value) })} hint="Covers your refund window." />
              <Input label="Attribution window (days)" type="number" min={1} max={365} value={cfgForm.cookieDays} onChange={(e) => setCfgForm({ ...cfgForm, cookieDays: Number(e.target.value) })} />
              <Input label="Minimum payout ($)" type="number" min={0} value={cfgForm.minPayoutCents / 100} onChange={(e) => setCfgForm({ ...cfgForm, minPayoutCents: Math.round(Number(e.target.value) * 100) })} />
              <Input label="Commission cap (months, 0 = lifetime)" type="number" min={0} max={120} value={cfgForm.capMonths} onChange={(e) => setCfgForm({ ...cfgForm, capMonths: Number(e.target.value) })} />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-secondary">Payout method</span>
                <Segmented value={cfgForm.payoutMode} onChange={(v) => setCfgForm({ ...cfgForm, payoutMode: v })} options={[{ id: 'connect', label: 'Stripe Connect' }, { id: 'manual', label: 'Manual' }]} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={cfgForm.enabled} onChange={(e) => setCfgForm({ ...cfgForm, enabled: e.target.checked })} className="accent-[#F5A623]" /> Program enabled (links attribute, applications open)</label>
              <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={cfgForm.freeMembership} onChange={(e) => setCfgForm({ ...cfgForm, freeMembership: e.target.checked })} className="accent-[#F5A623]" /> Free membership for active partners</label>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Partner agreement <span className="text-text-tertiary">(v{cfgForm.agreementVersion}; editing it asks every partner to re-accept)</span></span>
              <textarea value={cfgForm.agreementText} onChange={(e) => setCfgForm({ ...cfgForm, agreementText: e.target.value })} rows={10} className="w-full rounded-xl bg-surface-elevated border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-accent font-mono" />
            </div>
          </Panel>
        )}

        {view === 'resources' && resForm && (
          <div className="space-y-4">
            <Panel title="Files, videos and links partners can use" action={<Button size="sm" onClick={saveResources} disabled={busy}><Save className="w-4 h-4" /> Save</Button>}>
              <div className="space-y-2">
                {resForm.items.map((it, i) => (
                  <div key={i} className="grid sm:grid-cols-[1fr_1fr_120px_auto] gap-2 items-start">
                    <Input value={it.title} placeholder="Title" onChange={(e) => setResForm({ ...resForm, items: resForm.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <Input value={it.url} placeholder={it.kind === 'copy' ? 'Text partners can copy' : 'https://…'} onChange={(e) => setResForm({ ...resForm, items: resForm.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <select value={it.kind} onChange={(e) => setResForm({ ...resForm, items: resForm.items.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })} className="h-[42px] rounded-xl bg-surface-elevated border border-white/10 px-2 text-sm text-white">
                      {['video', 'image', 'file', 'link', 'copy'].map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" onClick={() => setResForm({ ...resForm, items: resForm.items.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={() => setResForm({ ...resForm, items: [...resForm.items, { title: '', url: '', kind: 'link', description: '' }] })}><Plus className="w-4 h-4" /> Add resource</Button>
              </div>
            </Panel>
            <Panel title="Tips (shown in the partner's Tips tab; defaults are used while this is empty)">
              <div className="space-y-2">
                {resForm.tips.map((t, i) => (
                  <div key={i} className="space-y-1.5 rounded-xl bg-surface-elevated p-3">
                    <div className="flex gap-2"><Input value={t.title} placeholder="Title" onChange={(e) => setResForm({ ...resForm, tips: resForm.tips.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Button variant="ghost" size="sm" onClick={() => setResForm({ ...resForm, tips: resForm.tips.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button></div>
                    <textarea value={t.body} rows={3} placeholder="The tip" onChange={(e) => setResForm({ ...resForm, tips: resForm.tips.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={() => setResForm({ ...resForm, tips: [...resForm.tips, { title: '', body: '' }] })}><Plus className="w-4 h-4" /> Add tip</Button>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {/* Partner detail */}
      <Modal open={!!detailId} onClose={() => { setDetailId(null); setDetail(null); }} title={detail ? `${detail.partner.profile?.name} · ${detail.partner.code}` : 'Partner'} className="max-w-3xl">
        {!detail ? <p className="text-sm text-text-secondary">Loading…</p> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_PILL[detail.partner.status] ?? 'muted'}>{detail.partner.status}</Pill>
              <Pill tone={detail.partner.connectReady ? 'ok' : 'muted'}>{detail.partner.connectReady ? 'Payouts connected' : detail.partner.connect ? 'Connect incomplete' : 'No payout account'}</Pill>
              <Pill tone={detail.partner.membershipGranted ? 'ok' : 'muted'}>{detail.partner.membershipGranted ? 'Free membership' : `Membership: ${detail.account.membership}`}</Pill>
              <span className="text-xs text-text-tertiary">Agreement v{detail.partner.agreementVersion}</span>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/p/${detail.partner.code}`).then(() => toast.success('Link copied')); }} className="ml-auto text-xs text-text-secondary hover:text-white inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Link</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV k="Clicks" v={detail.partner.stats.clicks} /><KV k="Sign-ups" v={detail.partner.stats.signups} /><KV k="Members" v={detail.partner.stats.members} /><KV k="Revenue" v={formatCents(detail.partner.stats.revenueCents)} />
              <KV k="Owed" v={formatCents(detail.balance.payableCents)} /><KV k="Pending" v={formatCents(detail.balance.pendingCents + detail.balance.reviewCents)} /><KV k="Paid" v={formatCents(detail.balance.paidCents)} /><KV k="Clawed back" v={formatCents(detail.balance.clawbackCents)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <KV k="Account" v={`${detail.account.displayName ?? '—'} · ${detail.account.email ?? '—'}`} /><KV k="Payout email" v={detail.partner.profile?.email} />
              <KV k="Channels" v={detail.partner.profile?.channels} /><KV k="Audience" v={detail.partner.profile?.audience || '—'} />
            </div>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{detail.partner.profile?.about}</p>

            <div className="grid sm:grid-cols-3 gap-2 items-end">
              <Input label="Commission override (%)" type="number" min={0} max={90} placeholder={`default ${data?.config.defaultPercent ?? 30}`} defaultValue={detail.partner.percentOverride ?? ''} onBlur={(e) => { const v = e.target.value; if (v === '' ? detail.partner.percentOverride !== null : Number(v) !== detail.partner.percentOverride) void update(detail.partner.uid, { percentOverride: v === '' ? null : Number(v) }); }} />
              <Input label="Cap override (months)" type="number" min={0} max={120} placeholder={data?.config.capMonths ? `default ${data.config.capMonths}` : 'lifetime'} defaultValue={detail.partner.capMonthsOverride ?? ''} onBlur={(e) => { const v = e.target.value; if (v === '' ? detail.partner.capMonthsOverride !== null : Number(v) !== detail.partner.capMonthsOverride) void update(detail.partner.uid, { capMonthsOverride: v === '' ? null : Number(v) }); }} />
              <div className="flex gap-2 flex-wrap">
                {detail.partner.status === 'applied' && <Button size="sm" onClick={() => update(detail.partner.uid, { status: 'active' }, 'Approved')} disabled={busy}><Check className="w-4 h-4" /> Approve</Button>}
                {detail.partner.status === 'active' && <Button size="sm" variant="secondary" onClick={() => setDecision({ uid: detail.partner.uid, status: 'suspended', reason: '' })} disabled={busy}><Pause className="w-4 h-4" /> Suspend</Button>}
                {detail.partner.status === 'suspended' && <Button size="sm" onClick={() => update(detail.partner.uid, { status: 'active' }, 'Reactivated')} disabled={busy}><Play className="w-4 h-4" /> Reactivate</Button>}
                {(detail.partner.status === 'applied' || detail.partner.status === 'active') && <Button size="sm" variant="ghost" onClick={() => setDecision({ uid: detail.partner.uid, status: 'rejected', reason: '' })} disabled={busy}><X className="w-4 h-4" /> Reject</Button>}
                <Button size="sm" variant="ghost" onClick={() => setAdjust({ uid: detail.partner.uid, amount: '', note: '' })}>Adjust</Button>
                {detail.partner.status === 'active' && <Button size="sm" variant="ghost" onClick={() => runPayouts(false, detail.partner.uid)} disabled={busy}><Wallet className="w-4 h-4" /> Pay now</Button>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Notes (private)</span>
              <textarea defaultValue={detail.partner.notes} rows={2} onBlur={(e) => { if (e.target.value !== detail.partner.notes) void update(detail.partner.uid, { notes: e.target.value }, 'Notes saved'); }} className="w-full rounded-xl bg-surface-elevated border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-accent" />
            </div>

            <div>
              <p className="text-sm font-bold text-white mb-1">Members ({detail.members.length})</p>
              <div className="max-h-48 overflow-y-auto divide-y divide-white/6 text-xs">
                {detail.members.map((m) => (
                  <div key={m.uid} className="py-1.5 flex items-center gap-2"><span className="flex-1 text-white truncate">{m.name ?? '—'} <span className="text-text-tertiary">{m.email}</span></span><span className="text-text-secondary">{m.source ?? ''}</span><span className="text-text-tertiary w-24 text-right">{fmtDate(m.joinedAt)}</span><Pill tone={m.status === 'active' ? 'ok' : 'muted'}>{m.status}</Pill></div>
                ))}
                {detail.members.length === 0 && <p className="text-text-secondary py-2">None yet.</p>}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">Ledger ({detail.ledger.length})</p>
              <div className="max-h-72 overflow-y-auto divide-y divide-white/6 text-xs">
                {detail.ledger.map((r) => (
                  <div key={r.id} className="py-2 flex flex-wrap items-center gap-2">
                    <span className="w-20 text-text-tertiary">{fmtDate(r.createdAt)}</span>
                    <span className="flex-1 min-w-[160px] text-text-secondary truncate">{r.note ?? r.planName ?? 'Membership'} {r.memberEmail ? `· ${r.memberEmail}` : ''} · {r.percent}% of {formatCents(r.netCents)}</span>
                    {r.flags.map((f) => <Pill key={f} tone="danger">{FLAG_LABELS[f] ?? f}</Pill>)}
                    <Pill tone={r.status === 'approved' || r.status === 'paid' ? 'ok' : r.status === 'review' || r.status === 'rejected' || r.status === 'clawback' ? 'danger' : 'muted'}>{r.status}</Pill>
                    <span className={`w-20 text-right font-bold ${r.commissionCents < 0 ? 'text-danger' : 'text-white'}`}>{formatCents(r.commissionCents)}</span>
                    {(r.status === 'review' || r.status === 'pending') && <><button onClick={() => reviewRow(r.id, 'approve')} className="text-success" title="Approve"><Check className="w-4 h-4" /></button><button onClick={() => reviewRow(r.id, 'reject')} className="text-danger" title="Reject"><X className="w-4 h-4" /></button></>}
                  </div>
                ))}
                {detail.ledger.length === 0 && <p className="text-text-secondary py-2">No commissions yet.</p>}
              </div>
            </div>
            {detail.partner.connectAccountId && <a href={`https://dashboard.stripe.com/connect/accounts/${detail.partner.connectAccountId}`} target="_blank" rel="noreferrer" className="text-xs text-text-secondary hover:text-white inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Open Connect account in Stripe</a>}
          </div>
        )}
      </Modal>

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision?.status === 'rejected' ? 'Reject application' : 'Suspend partner'}>
        {decision && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{decision.status === 'rejected' ? 'The applicant is emailed. A reason is optional but kind.' : 'The link stops attributing, pending commissions freeze, approved ones are still paid. The partner is emailed.'}</p>
            <Input label="Reason (sent to them, optional)" value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} maxLength={500} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDecision(null)}>Cancel</Button><Button variant="danger" onClick={() => { void update(decision.uid, { status: decision.status, reason: decision.reason }, decision.status === 'rejected' ? 'Rejected and emailed' : 'Suspended and emailed'); setDecision(null); }} disabled={busy}>{decision.status === 'rejected' ? 'Reject' : 'Suspend'}</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Manual adjustment">
        {adjust && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">A bonus (positive) or a correction (negative), approved immediately, with your note on the row.</p>
            <Input label="Amount ($, negative to deduct)" type="number" step="0.01" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
            <Input label="Note (required)" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} maxLength={300} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button><Button onClick={submitAdjust} disabled={busy || !adjust.note.trim() || !Number(adjust.amount)}>Add</Button></div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}

function Row({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between rounded-xl bg-surface-elevated px-3 py-2.5 hover:bg-white/10 text-left">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-bold ${value > 0 ? 'text-accent' : 'text-text-tertiary'}`}>{value}</span>
    </button>
  );
}
