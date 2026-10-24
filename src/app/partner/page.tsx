'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import {
  Copy, QrCode, Users, MousePointerClick, UserPlus, Wallet, Clock, FolderOpen, Lightbulb, FileText, ChevronLeft,
  ExternalLink, CheckCircle2, AlertTriangle, Download, Video, Image as ImageIcon, Link2, Type,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackground } from '@/components/ui/AppBackground';
import { CornerBrackets, SectionEyebrow } from '@/components/landing/chrome';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCents, type Balance } from '@/lib/partners';
import { getSystemConfig } from '@/lib/firestore';

/**
 * /partner — the partner's own section. Everything comes from
 * /api/partner/me, scoped to the signed-in uid. Outside the (app) route
 * group on purpose: the membership guard does not apply here (partners get
 * membership as a perk, but the dashboard must work before approval too).
 */

type Tab = 'overview' | 'members' | 'resources' | 'tips' | 'payouts' | 'agreement';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: MousePointerClick },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'resources', label: 'Resources', icon: FolderOpen },
  { id: 'tips', label: 'Tips', icon: Lightbulb },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'agreement', label: 'Agreement', icon: FileText },
];

interface Me {
  partner: { uid: string; code: string; status: string; profile: { name: string; email: string }; percent: number; capMonths: number; connectReady: boolean; hasConnect: boolean; agreementVersion: number; agreementAcceptedAt: string | null; membershipGranted: boolean } | null;
  config: { enabled: boolean; defaultPercent: number; holdDays: number; cookieDays: number; minPayoutCents: number; payoutMode: 'connect' | 'manual'; agreementText: string; agreementVersion: number };
  links?: { link: string; short: string };
  stats: { totals: { clicks: number; signups: number; members: number }; months: { month: string; clicks?: number; signups?: number; members?: number }[]; balance: Balance; nextPayoutAt: string; eligible: boolean } | null;
  ledger?: { id: string; status: string; commissionCents: number; grossCents: number; percent: number; currency: string; createdAt: string | null; holdUntil: string | null; planName: string | null; note: string | null; member: string }[];
  members?: { id: string; name: string; joinedAt: string | null; status: string; plan: string | null }[];
  payouts?: { id: string; amountCents: number; currency: string; status: string; method: string; createdAt: string | null; period: string }[];
  resources?: { title: string; url: string; kind: string; description: string }[];
  tips?: { title: string; body: string }[];
}

const STATUS_TONE: Record<string, string> = { approved: 'text-success', paid: 'text-success', pending: 'text-text-secondary', review: 'text-accent', rejected: 'text-danger', clawback: 'text-danger' };
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function PartnerPage() {
  return <Suspense fallback={<BrandSplash />}><PartnerPageInner /></Suspense>;
}

function PartnerPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.id === search.get('tab')) ? (search.get('tab') as Tab) : 'overview'));
  const [qr, setQr] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [appName, setAppName] = useState('Warfare Fitness');
  useEffect(() => { getSystemConfig().then((c) => { if (c?.appName) setAppName(String(c.appName)); }).catch(() => {}); }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/partner/me', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({})) as Me & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Could not load'); return; }
      setMe(data);
    } catch { setError('Could not load your partner data.'); }
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login?next=/partner'); return; }
    void load();
  }, [loading, user, router, load]);

  // Back from Stripe Connect onboarding: refresh readiness.
  useEffect(() => {
    const c = search.get('connect');
    if (!c || !user) return;
    (async () => {
      try {
        const token = await getIdToken(user);
        await fetch('/api/partner/connect', { headers: { Authorization: `Bearer ${token}` } });
        await load();
        if (c === 'return') toast.success('Payout account updated');
      } catch { /* fine */ }
    })();
  }, [search, user, load]);

  useEffect(() => {
    if (!me?.links?.link) return;
    QRCode.toDataURL(me.links.link, { width: 480, margin: 1, color: { dark: '#000000', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [me?.links?.link]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error('Could not copy'); }
  };

  const connect = async () => {
    if (!user || connectBusy) return;
    setConnectBusy(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/partner/connect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error ?? 'Could not start Stripe onboarding');
    } catch { toast.error('Could not start Stripe onboarding'); }
    finally { setConnectBusy(false); }
  };

  const acceptAgreement = async () => {
    if (!user) return;
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/partner/agreement', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      toast.success('Agreement accepted'); await load();
    } catch { toast.error('Could not record acceptance'); }
  };

  const chart = useMemo(() => {
    const months = me?.stats?.months ?? [];
    const max = Math.max(1, ...months.map((m) => Math.max(m.clicks ?? 0, (m.members ?? 0) * 10)));
    return { months, max };
  }, [me]);

  if (loading || !user || (!me && !error)) return <BrandSplash label="Loading partner dashboard" />;

  const shell = (children: React.ReactNode) => (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      <AppBackground />
      {/* The landing's instrument field: one bloom, a faint grid, painted once. */}
      <div aria-hidden className="wf-field" style={{ height: 420 }} />
      <header className="relative z-10 max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-white"><ChevronLeft className="w-4 h-4" /> App</Link>
        <SectionEyebrow live>Partner console</SectionEyebrow>
      </header>
      <main className="relative z-10 max-w-4xl mx-auto px-4 pb-20 pt-2 space-y-4">{children}</main>
    </div>
  );

  if (error) return shell(<Card className="p-6 text-center"><p className="text-sm text-danger">{error}</p><Button className="mt-3" variant="secondary" onClick={load}>Retry</Button></Card>);
  if (!me?.partner) {
    return shell(
      <Card className="p-6 text-center space-y-2">
        <p className="text-sm font-bold text-white">You are not a partner yet</p>
        <p className="text-sm text-text-secondary">Earn {me?.config.defaultPercent ?? 30}% of every payment from members you refer.</p>
        <Button onClick={() => router.push('/partners')}>See the program and apply</Button>
      </Card>,
    );
  }
  const p = me.partner;
  if (p.status !== 'active') {
    const copyByStatus: Record<string, { title: string; body: string }> = {
      applied: { title: 'Application under review', body: 'We review by hand, usually within two working days. You will get an email either way. Your code is reserved.' },
      rejected: { title: 'Application not approved', body: 'Your previous application was not approved. You are welcome to apply again later.' },
      suspended: { title: 'Partner account paused', body: 'Your link is paused. Approved commissions are still paid out. Contact support if you think this is a mistake.' },
    };
    const c = copyByStatus[p.status] ?? copyByStatus.applied;
    return shell(
      <Card className="p-6 text-center space-y-2">
        <Clock className="w-8 h-8 text-accent mx-auto" />
        <p className="text-sm font-bold text-white">{c.title}</p>
        <p className="text-sm text-text-secondary">{c.body}</p>
        <p className="text-xs text-text-tertiary">Code: <span className="font-mono font-bold text-white">{p.code}</span></p>
        {p.status === 'rejected' && <Button onClick={() => router.push('/partners')}>Apply again</Button>}
      </Card>,
    );
  }

  const s = me.stats!;
  const b = s.balance;
  const needsAgreement = p.agreementVersion < me.config.agreementVersion;
  const payoutWarning = me.config.payoutMode === 'connect' && !p.connectReady;

  return shell(
    <>
      {needsAgreement && (
        <Card className="p-4 border-accent/40 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p className="text-sm font-bold text-white">The partner agreement was updated</p><p className="text-xs text-text-secondary">Read it under Agreement and accept the new version to keep earning.</p></div>
          <Button size="sm" variant="secondary" onClick={() => setTab('agreement')}>Read</Button>
        </Card>
      )}
      {payoutWarning && (
        <Card className="p-4 border-accent/40 flex items-start gap-3">
          <Wallet className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1"><p className="text-sm font-bold text-white">Connect your payout account</p><p className="text-xs text-text-secondary">Stripe collects your bank details and tax info. Takes about 3 minutes. Until then, payouts are made manually.</p></div>
          <Button size="sm" onClick={connect} disabled={connectBusy}>{p.hasConnect ? 'Finish setup' : 'Connect'}</Button>
        </Card>
      )}

      {/* Link + code, always visible */}
      <div className="group relative overflow-hidden rounded-2xl border border-accent/20 bg-surface/70 p-4 sm:p-5 backdrop-blur-sm">
        <CornerBrackets size="w-3.5 h-3.5" />
        <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
        <div aria-hidden className="wf-dots pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="wf-readout text-[10px] font-bold text-accent">Your link</p>
              <p className="wf-readout text-[10px] text-text-tertiary">{p.profile?.name} · {p.percent}% {p.capMonths ? `· ${p.capMonths} mo` : '· lifetime'}</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-xl bg-surface-elevated px-3 py-2 text-sm text-white">{me.links!.link}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(me.links!.link, 'Link')}><Copy className="w-4 h-4" /></Button>
            </div>
            <p className="wf-readout text-[10px] font-bold text-accent pt-1">Your code</p>
            <div className="flex items-center gap-2">
              <code className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xl font-black tracking-[0.28em] text-accent">{p.code}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(p.code, 'Code')}><Copy className="w-4 h-4" /></Button>
              <span className="text-[11px] text-text-tertiary">Say it in videos. Typed at checkout.</span>
            </div>
          </div>
          {qr && (
            <div className="flex flex-col items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for your link" className="w-28 h-28 rounded-xl bg-white p-1" />
              <a href={qr} download={`${p.code}-qr.png`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-secondary hover:text-white"><QrCode className="w-3.5 h-3.5" /> Download QR</a>
            </div>
          )}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1" aria-label="Partner sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap transition-colors ${tab === id ? 'border-accent/50 bg-accent-muted text-accent shadow-[0_0_18px_-6px_rgb(var(--accent-rgb)/0.6)]' : 'border-white/10 bg-black/25 text-text-secondary hover:text-white hover:border-white/20'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={MousePointerClick} label="Clicks" value={s.totals.clicks} caption="unique visitors per day" />
            <Stat icon={UserPlus} label="Sign-ups" value={s.totals.signups} caption="accounts via your link" />
            <Stat icon={Users} label="Paying members" value={s.totals.members} caption={`${s.totals.clicks ? Math.round((s.totals.members / s.totals.clicks) * 1000) / 10 : 0}% of clicks`} />
            <Stat icon={Wallet} label="Lifetime earned" value={formatCents(b.lifetimeCents)} caption="net of reversals" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4"><p className="wf-readout text-[10px] font-bold text-text-tertiary">Pending</p><p className="text-xl font-extrabold text-white">{formatCents(b.pendingCents + b.reviewCents)}</p><p className="text-xs text-text-secondary">clears {me.config.holdDays} days after each payment</p></Card>
            <Card className="p-4"><p className="wf-readout text-[10px] font-bold text-accent">Ready to pay</p><p className="text-xl font-extrabold text-success">{formatCents(b.payableCents)}</p><p className="text-xs text-text-secondary">{s.eligible ? `next payout ${fmtDate(s.nextPayoutAt)}` : `minimum ${formatCents(me.config.minPayoutCents)}`}</p></Card>
            <Card className="p-4"><p className="wf-readout text-[10px] font-bold text-text-tertiary">Paid out</p><p className="text-xl font-extrabold text-white">{formatCents(b.paidCents)}</p><p className="text-xs text-text-secondary">{me.payouts?.length ?? 0} payout{(me.payouts?.length ?? 0) === 1 ? '' : 's'}</p></Card>
          </div>
          <Card className="p-4 sm:p-5">
            <p className="wf-readout text-[10px] font-bold text-accent mb-3">Last 12 months</p>
            {chart.months.length === 0 ? <p className="text-xs text-text-secondary">No activity yet. Share your link to see clicks here.</p> : (
              <div className="flex items-end gap-1.5 h-32">
                {chart.months.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.month}: ${m.clicks ?? 0} clicks, ${m.signups ?? 0} sign-ups, ${m.members ?? 0} members`}>
                    <div className="w-full flex items-end gap-px h-24">
                      <div className="flex-1 rounded-t bg-white/20" style={{ height: `${Math.max(2, ((m.clicks ?? 0) / chart.max) * 100)}%` }} />
                      <div className="flex-1 rounded-t bg-accent" style={{ height: `${Math.max(2, (((m.members ?? 0) * 10) / chart.max) * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-text-tertiary truncate">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-text-tertiary mt-2">Grey: clicks. Orange: paying members (×10).</p>
          </Card>
          <Card className="p-4 sm:p-5">
            <p className="wf-readout text-[10px] font-bold text-accent mb-2">Recent commissions</p>
            {!me.ledger?.length ? <p className="text-xs text-text-secondary">Nothing yet. Commission appears here the moment a referred member pays.</p> : (
              <div className="divide-y divide-white/6">
                {me.ledger.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className="w-20 text-text-tertiary">{fmtDate(r.createdAt)}</span>
                    <span className="flex-1 text-text-secondary truncate">{r.note ?? r.planName ?? 'Membership'} · member {r.member}</span>
                    <span className={`font-bold ${STATUS_TONE[r.status] ?? ''}`}>{r.status}</span>
                    <span className={`w-20 text-right font-bold ${r.commissionCents < 0 ? 'text-danger' : 'text-white'}`}>{formatCents(r.commissionCents, r.currency.toUpperCase())}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'members' && (
        <Card className="p-4 sm:p-5">
          <p className="text-sm font-bold text-white mb-1">Members you referred</p>
          <p className="text-xs text-text-secondary mb-3">First names only. A member counts here once they have paid.</p>
          {!me.members?.length ? <p className="text-xs text-text-secondary">No paying members yet.</p> : (
            <div className="divide-y divide-white/6">
              {me.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1 text-white font-medium">{m.name}</span>
                  <span className="text-xs text-text-secondary">{m.plan ?? 'Membership'}</span>
                  <span className="text-xs text-text-tertiary w-24 text-right">{fmtDate(m.joinedAt)}</span>
                  <span className={`text-[11px] font-bold ${m.status === 'active' ? 'text-success' : 'text-text-tertiary'}`}>{m.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'resources' && (
        <div className="space-y-3">
          <Card className="p-4 sm:p-5">
            <p className="text-sm font-bold text-white">Ready-to-post copy</p>
            <p className="text-xs text-text-secondary mt-1 mb-3">Your link and code are already filled in. Copy and go.</p>
            <div className="space-y-2">
              {[
                `I train on ${appName}: programs written from the research, not vibes. 7-day free start with my link → ${me.links!.link}`,
                `If you are starting a cut, do it with a plan. Mine is on the app. Use code ${p.code} at checkout, it credits me and costs you nothing → ${me.links!.link}`,
                `Every program on here cites the study behind it. Try it: ${me.links!.link}`,
              ].map((t) => (
                <div key={t} className="flex items-start gap-2 rounded-xl bg-surface-elevated px-3 py-2">
                  <p className="flex-1 text-xs text-text-secondary leading-relaxed">{t}</p>
                  <button onClick={() => copy(t, 'Post')} className="text-text-tertiary hover:text-white" aria-label="Copy"><Copy className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-3">Files and videos</p>
            {!me.resources?.length ? <p className="text-xs text-text-secondary">Nothing uploaded yet. Check back soon.</p> : (
              <div className="grid sm:grid-cols-2 gap-2">
                {me.resources.map((r, i) => {
                  const Icon = r.kind === 'video' ? Video : r.kind === 'image' ? ImageIcon : r.kind === 'copy' ? Type : r.kind === 'file' ? Download : Link2;
                  return r.kind === 'copy' ? (
                    <div key={i} className="rounded-xl bg-surface-elevated p-3 space-y-1">
                      <div className="flex items-center gap-2"><Icon className="w-4 h-4 text-accent" /><p className="text-sm font-semibold text-white flex-1">{r.title}</p><button onClick={() => copy(r.url, 'Text')} aria-label="Copy"><Copy className="w-4 h-4 text-text-tertiary hover:text-white" /></button></div>
                      <p className="text-xs text-text-secondary whitespace-pre-wrap">{r.url}</p>
                    </div>
                  ) : (
                    <a key={i} href={r.url} target="_blank" rel="noreferrer" className="rounded-xl bg-surface-elevated p-3 flex items-start gap-2 hover:bg-white/5">
                      <Icon className="w-4 h-4 text-accent mt-0.5" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white truncate">{r.title}</p>{r.description && <p className="text-xs text-text-secondary">{r.description}</p>}</div>
                      <ExternalLink className="w-3.5 h-3.5 text-text-tertiary" />
                    </a>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'tips' && (
        <div className="space-y-2">
          {[
            ...(me.tips ?? []),
            ...(me.tips?.length ? [] : [
              { title: 'Say the code, show the link', body: 'In a video, say your code out loud once near the start and once at the end. Put the link in the first comment and your bio. People who hear a code remember it; people who see a link tap it.' },
              { title: 'Lead with a result, not the app', body: 'Post your own session, a PR, a before/after. Mention the app as the thing that programmed it. An ad for an app gets skipped; a result with a tool behind it gets asked about.' },
              { title: 'Use the study videos', body: 'The research clips in Resources are made to be reposted. Add one line in your voice on top and your link below. They already did 80k+ views on our account.' },
              { title: 'Do not discount, explain', body: 'Your code is not a coupon and you should not promise one. Explain the free start and that the code credits you. People trust a recommendation more than a deal.' },
              { title: 'Renewals are where the money is', body: 'You are paid every month a member stays. Check in on the people you sent. A message in week two keeps more members than any post.' },
            ]),
          ].map((t) => (
            <Card key={t.title} className="p-4"><p className="text-sm font-bold text-white">{t.title}</p><p className="text-xs text-text-secondary mt-1 leading-relaxed whitespace-pre-wrap">{t.body}</p></Card>
          ))}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="space-y-3">
          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Wallet className="w-5 h-5 text-accent mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Payout account</p>
                {me.config.payoutMode === 'manual' ? (
                  <p className="text-xs text-text-secondary mt-1">Payouts are made by bank transfer each month. Make sure the email on your profile is the one you want statements sent to.</p>
                ) : p.connectReady ? (
                  <p className="text-xs text-success mt-1 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Connected. Payouts go to your Stripe account monthly.</p>
                ) : (
                  <p className="text-xs text-text-secondary mt-1">Not connected yet. Stripe verifies your identity and bank once; after that payouts are automatic.</p>
                )}
              </div>
              {me.config.payoutMode === 'connect' && <Button size="sm" variant={p.connectReady ? 'secondary' : 'primary'} onClick={connect} disabled={connectBusy}>{p.connectReady ? 'Manage' : p.hasConnect ? 'Finish setup' : 'Connect Stripe'}</Button>}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-xl bg-surface-elevated p-3"><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Ready</p><p className="text-base font-extrabold text-success">{formatCents(b.payableCents)}</p></div>
              <div className="rounded-xl bg-surface-elevated p-3"><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Pending</p><p className="text-base font-extrabold text-white">{formatCents(b.pendingCents + b.reviewCents)}</p></div>
              <div className="rounded-xl bg-surface-elevated p-3"><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Minimum</p><p className="text-base font-extrabold text-white">{formatCents(me.config.minPayoutCents)}</p></div>
            </div>
            <p className="text-[11px] text-text-tertiary mt-2">Payouts run monthly. Commission is held {me.config.holdDays} days after each payment and reversed if the payment is refunded.</p>
          </Card>
          <Card className="p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-2">Statements</p>
            {!me.payouts?.length ? <p className="text-xs text-text-secondary">No payouts yet.</p> : (
              <div className="divide-y divide-white/6">
                {me.payouts.map((po) => (
                  <div key={po.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-24 text-xs text-text-tertiary">{fmtDate(po.createdAt)}</span>
                    <span className="flex-1 text-text-secondary text-xs">{po.period} · {po.method === 'connect' ? 'Stripe' : 'Bank transfer'}</span>
                    <span className={`text-[11px] font-bold ${po.status === 'paid' ? 'text-success' : po.status === 'failed' ? 'text-danger' : 'text-text-secondary'}`}>{po.status.replace('_', ' ')}</span>
                    <span className="w-24 text-right font-bold text-white">{formatCents(po.amountCents, po.currency.toUpperCase())}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'agreement' && (
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-white">Partner agreement <span className="text-text-tertiary font-medium">v{me.config.agreementVersion}</span></p>
            {needsAgreement ? <Button size="sm" onClick={acceptAgreement}>Accept v{me.config.agreementVersion}</Button> : <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Accepted {fmtDate(p.agreementAcceptedAt)}</span>}
          </div>
          <pre className="whitespace-pre-wrap text-xs text-text-secondary leading-relaxed font-sans">{me.config.agreementText}</pre>
        </Card>
      )}
    </>,
  );
}

function Stat({ icon: Icon, label, value, caption }: { icon: React.ElementType; label: string; value: React.ReactNode; caption?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface/70 p-4 flex flex-col gap-1.5 card-float">
      <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
      <div className="relative flex items-center justify-between"><span className="wf-readout text-[10px] font-bold text-accent">{label}</span><span className="w-7 h-7 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-accent" /></span></div>
      <p className="relative text-[28px] font-black text-white tabular-nums leading-none tracking-tight">{value}</p>
      {caption && <p className="relative text-[11px] text-text-tertiary">{caption}</p>}
    </div>
  );
}
