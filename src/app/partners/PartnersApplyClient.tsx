'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Repeat, Percent, Link2, BarChart3, FolderOpen, Lightbulb, Wallet, Clock, Crown, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { TechField, techInputClass } from '@/components/ui/TechField';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { Reveal } from '@/components/public/Reveal';
import { CornerBrackets, DataDivider, SectionEyebrow } from '@/components/landing/chrome';
import { normalizePartnerConfig, type PartnerProgramConfig } from '@/lib/partners';

/**
 * /partners — the public "become a partner" page, in the same instrument
 * language as the landing and program pages: the tactical backdrop behind
 * the hero, readout labels, bracketed panels, the dot lattice on the cards.
 * Applying needs an account (the partner record is keyed by uid), so a
 * visitor is sent to sign up and brought back here.
 */
export function PartnersApplyClient({ initialAppName, initialLogoUrl, programs }: { initialAppName: string; initialLogoUrl: string | null; programs: { name: string; slug: string }[] }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [cfg, setCfg] = useState<PartnerProgramConfig>(() => normalizePartnerConfig(null));
  const [existing, setExisting] = useState<{ status: string; code: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', channels: '', audience: '', about: '', website: '', code: '', agree: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string } | null>(null);

  useEffect(() => {
    getDoc(doc(db, 'config', 'partnerProgram')).then((s) => setCfg(normalizePartnerConfig(s.data() as Partial<PartnerProgramConfig> | undefined))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: f.name || user.displayName || '', email: f.email || user.email || '' }));
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/partner/me', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({})) as { partner?: { status: string; code: string } | null };
        if (data.partner) setExisting({ status: data.partner.status, code: data.partner.code });
      } catch { /* form stays */ }
    })();
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/partner/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; code?: string; status?: string; requestedHandleGranted?: boolean };
      if (!res.ok || !data.ok) { toast.error(data.error ?? 'Could not submit'); return; }
      if (data.status === 'active') { router.replace('/partner'); return; }
      setDone({ code: data.code! });
      if (form.code && data.requestedHandleGranted === false) toast('That handle was taken, so we issued you a code instead.');
    } catch { toast.error('Could not submit right now'); }
    finally { setBusy(false); }
  };

  const perks = [
    { icon: Repeat, k: 'RECURRING', title: 'Paid every month they stay', body: 'You earn on every renewal, not a one-off bounty. One good referral pays for months.' },
    { icon: Percent, k: `${cfg.defaultPercent}% SHARE`, title: 'Of the net of every payment', body: 'Far above the 5–10% most software programs pay. Partners who bring volume are moved higher.' },
    { icon: Link2, k: 'LINK + CODE', title: 'Both tracked, both yours', body: 'A link for bios and stories. A code to say out loud in a video and type at checkout.' },
    { icon: BarChart3, k: 'LIVE', title: 'Dashboard, not a monthly email', body: 'Clicks, sign-ups, paying members, earnings and your next payout, as they happen.' },
    { icon: FolderOpen, k: 'ASSETS', title: 'Ready-made content', body: 'Logos, screenshots, the study videos, captions and a swipe file of hooks that already performed.' },
    { icon: Lightbulb, k: 'PLAYBOOK', title: 'What converts, what does not', body: 'Short, specific tips from what has worked on our own channels.' },
    { icon: Wallet, k: 'PAYOUTS', title: 'Monthly, straight to your bank', body: `Through Stripe once you clear $${(cfg.minPayoutCents / 100).toFixed(0)}. Statement included.` },
    { icon: Clock, k: `${cfg.cookieDays} DAYS`, title: 'Attribution window', body: 'If someone clicks today and buys next month, you are still paid.' },
    ...(cfg.freeMembership ? [{ icon: Crown, k: 'INCLUDED', title: 'Free membership while active', body: 'Train on the full app at no cost. Know what you are recommending.' }] : []),
  ];

  const steps = [
    ['Apply', 'Two minutes. We review by hand, usually within two working days.'],
    ['Share', 'Your link or your code. Anyone who signs up through it is attributed to you.'],
    ['Earn', `${cfg.defaultPercent}% of the net amount of their payment, and of every renewal after it.`],
    ['Clear', `Commission clears ${cfg.holdDays} days after each payment. Refunds reverse it.`],
    ['Get paid', 'Connect Stripe once. Payouts run monthly.'],
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <TacticalBackdrop className="h-[720px]" />
        <div className="relative z-10">
          <PublicNav programs={programs} logoUrl={initialLogoUrl} appName={initialAppName} />

          <header className="max-w-5xl mx-auto px-5 pt-10 pb-12 sm:pt-16 sm:pb-16 text-center">
            <Reveal>
              <SectionEyebrow live>Partner program · applications open</SectionEyebrow>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[58px] font-black text-white leading-[1.04] tracking-tight">
                Send people who want to train.<br />
                <span className="wf-lit">Get paid every month they stay.</span>
              </h1>
              <p className="mt-5 text-sm sm:text-base text-text-secondary max-w-2xl mx-auto">
                {initialAppName} partners earn <strong className="text-white">{cfg.defaultPercent}% of every payment</strong> from members who join through their link, for the life of the membership. Built for coaches, gym owners and creators who actually train people.
              </p>
              <div className="group relative max-w-md mx-auto mt-8 p-5 rounded-2xl border border-accent/20 bg-surface/60 backdrop-blur-sm">
                <CornerBrackets size="w-3.5 h-3.5" />
                <p className="wf-readout text-[10px] font-bold text-accent mb-3">Recurring · {cfg.defaultPercent}% · lifetime</p>
                <a href="#apply" className="block"><Button size="lg" fullWidth>Apply to become a partner <ArrowRight className="w-4 h-4" /></Button></a>
                <p className="text-[11px] text-text-tertiary text-center mt-2">Free to join. Reviewed by hand.</p>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-y-2">
                {[{ Icon: ShieldCheck, label: 'Tracked by Stripe invoices' }, { Icon: Clock, label: `${cfg.cookieDays}-day attribution` }, { Icon: Wallet, label: 'Monthly payouts' }].map(({ Icon, label }, i) => (
                  <div key={label} className={`flex items-center gap-1.5 px-3 text-[11px] text-text-tertiary wf-readout ${i > 0 ? 'sm:border-l sm:border-white/10' : ''}`}>
                    <Icon className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {label}
                  </div>
                ))}
              </div>
            </Reveal>
          </header>
        </div>
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-5 pb-16 space-y-14">
        <section>
          <Reveal>
            <SectionEyebrow>What partners get</SectionEyebrow>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white">Nine reasons this beats a coupon code.</h2>
          </Reveal>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {perks.map(({ icon: Icon, k, title, body }, i) => (
              <Reveal key={title} delay={i * 40}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-surface/70 p-5 card-float">
                  <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
                  <div aria-hidden className="wf-dots pointer-events-none absolute inset-0" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <p className="wf-readout text-[10px] font-bold text-accent">{k}</p>
                      <span className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center"><Icon className="w-4 h-4 text-accent" /></span>
                    </div>
                    <p className="mt-3 text-sm font-bold text-white">{title}</p>
                    <p className="mt-1 text-xs text-text-secondary leading-relaxed">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <DataDivider />

        <section>
          <Reveal>
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white">Five steps. No guesswork.</h2>
          </Reveal>
          <ol className="mt-6 grid sm:grid-cols-5 gap-3">
            {steps.map(([t, b], i) => (
              <Reveal key={t} delay={i * 50}>
                <li className="relative rounded-2xl border border-white/10 bg-surface/60 p-4 h-full">
                  <p className="wf-readout text-[10px] font-bold text-accent">0{i + 1}</p>
                  <p className="mt-1 text-sm font-bold text-white">{t}</p>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">{b}</p>
                </li>
              </Reveal>
            ))}
          </ol>
          <p className="mt-4 text-xs text-text-tertiary">No self-referral, no spam, no bidding on our brand name in ads. Every commission is computed from the Stripe invoice, held {cfg.holdDays} days, and reversed on refund. The full agreement is in the form.</p>
        </section>

        <DataDivider />

        <section id="apply" className="scroll-mt-24">
          <Reveal>
            <SectionEyebrow live>Apply</SectionEyebrow>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white">Tell us where you will send people.</h2>
          </Reveal>
          <div className="mt-6">
            {!cfg.enabled ? (
              <Panel><p className="text-sm text-text-secondary text-center">The partner program is not taking applications right now.</p></Panel>
            ) : loading ? null : !user ? (
              <Panel>
                <p className="wf-readout text-[10px] font-bold text-accent">Step 0</p>
                <p className="mt-1 text-lg font-bold text-white">Create a free account to apply</p>
                <p className="text-sm text-text-secondary mt-1">Your partner dashboard lives in your account. It takes a minute and you are brought straight back here.</p>
                <div className="mt-5 grid grid-cols-2 gap-2 max-w-md">
                  <Button onClick={() => router.push('/register?next=/partners')}>Create account</Button>
                  <Button variant="secondary" onClick={() => router.push('/login?next=/partners')}>Sign in</Button>
                </div>
              </Panel>
            ) : existing ? (
              <Panel center>
                <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
                <p className="mt-2 text-lg font-bold text-white">
                  {existing.status === 'active' ? 'You are an active partner.' : existing.status === 'applied' ? 'Your application is under review.' : existing.status === 'suspended' ? 'Your partner account is paused.' : 'Your previous application was not approved.'}
                </p>
                <p className="wf-readout text-[10px] text-text-tertiary mt-1">Code {existing.code}</p>
                <div className="mt-4">
                  {existing.status === 'rejected' ? <Button onClick={() => setExisting(null)}>Apply again</Button> : <Button onClick={() => router.push('/partner')}>Open partner dashboard <ArrowRight className="w-4 h-4" /></Button>}
                </div>
              </Panel>
            ) : done ? (
              <Panel center>
                <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
                <p className="mt-2 text-lg font-bold text-white">Application sent</p>
                <p className="text-sm text-text-secondary mt-1">Your code <span className="font-mono font-bold text-white">{done.code}</span> is reserved. We will email you when it is reviewed.</p>
                <div className="mt-4"><Button variant="secondary" onClick={() => router.push('/partner')}>Check status</Button></div>
              </Panel>
            ) : (
              <form onSubmit={submit} className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
                <Panel>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <TechField label="Name"><input className={techInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} autoComplete="name" /></TechField>
                    <TechField label="Payout email"><input className={techInputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={120} autoComplete="email" /></TechField>
                    <TechField label="Where you will promote" hint="IG · YT · gym · newsletter" className="sm:col-span-2"><input className={techInputClass} value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} required maxLength={500} placeholder="@handle, channel, club name" /></TechField>
                    <TechField label="Audience size"><input className={techInputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="12k followers · 40 clients" maxLength={120} /></TechField>
                    <TechField label="Website" hint="optional"><input className={techInputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" maxLength={200} /></TechField>
                    <TechField label="About you and your audience" hint={`${form.about.length}/2000`} className="sm:col-span-2">
                      <textarea className={`${techInputClass} resize-none`} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} required minLength={20} maxLength={2000} rows={4} placeholder="Who follows you, what you train, why they would want this." />
                    </TechField>
                    <TechField label="Preferred code" hint="3–20 letters or numbers" className="sm:col-span-2">
                      <input className={`${techInputClass} font-mono tracking-[0.2em] uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="COACHMIKE" maxLength={20} />
                    </TechField>
                  </div>
                </Panel>
                <div className="space-y-3">
                  <Panel>
                    <p className="wf-readout text-[10px] font-bold text-accent">Agreement · v{cfg.agreementVersion}</p>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] text-text-secondary leading-relaxed max-h-56 overflow-y-auto font-sans pr-1">{cfg.agreementText}</pre>
                    <label className="mt-3 flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-0.5 accent-[#F5A623]" required />
                      <span>I have read and accept the partner agreement.</span>
                    </label>
                  </Panel>
                  <Button type="submit" fullWidth size="lg" disabled={busy || !form.agree}>{busy ? 'Sending…' : 'Send application'} <ArrowRight className="w-4 h-4" /></Button>
                  <p className="text-[11px] text-text-tertiary text-center">Reviewed by hand. You will hear back either way.</p>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
      <PublicFooter appName={initialAppName} />
    </div>
  );
}

function Panel({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-surface/70 p-5 sm:p-6 ${center ? 'text-center' : ''}`}>
      <CornerBrackets size="w-3.5 h-3.5" />
      <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
      <div className="relative">{children}</div>
    </div>
  );
}
