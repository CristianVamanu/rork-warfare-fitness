'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Repeat, Percent, Link2, BarChart3, FolderOpen, Lightbulb, Wallet, Clock, Crown, ArrowRight, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { AppBackground } from '@/components/ui/AppBackground';
import { normalizePartnerConfig, type PartnerProgramConfig } from '@/lib/partners';

/**
 * /partners — the public "become a partner" page: what partners get, how it
 * works, and the application form. Applying needs an account (the partner
 * record is keyed by uid), so a visitor is sent to sign up and brought back.
 */
export function PartnersApplyClient({ initialAppName, initialLogoUrl }: { initialAppName: string; initialLogoUrl: string | null }) {
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
    { icon: Repeat, title: 'Recurring, not one-off', body: 'You earn on every renewal, for as long as the member stays. One good referral pays for months.' },
    { icon: Percent, title: `${cfg.defaultPercent}% revenue share`, body: 'Far above the 5–10% most software programs pay. Partners who bring volume can be moved higher.' },
    { icon: Link2, title: 'Your link and your code', body: 'A link for bios and stories, a code to say out loud in videos. Both tracked, both yours.' },
    { icon: BarChart3, title: 'Live dashboard', body: 'Clicks, sign-ups, paying members, earnings and your next payout. No asking.' },
    { icon: FolderOpen, title: 'Ready-made content', body: 'Logos, screenshots, the study videos, captions and a swipe file of hooks that already performed.' },
    { icon: Lightbulb, title: 'Tips that work', body: 'What to post, when, and how to pitch a plan without sounding like an ad.' },
    { icon: Wallet, title: 'Monthly payouts', body: `Straight to your bank through Stripe once you clear $${(cfg.minPayoutCents / 100).toFixed(0)}, with a statement.` },
    { icon: Clock, title: `${cfg.cookieDays}-day window`, body: 'If someone clicks today and buys next month, you are still paid.' },
    ...(cfg.freeMembership ? [{ icon: Crown, title: 'Free membership', body: 'Active partners train on the full app at no cost. Know what you are recommending.' }] : []),
  ];

  const signedOutCta = (
    <Card className="p-6 text-center">
      <p className="text-sm font-bold text-white">Create a free account to apply</p>
      <p className="text-sm text-text-secondary mt-1">Your partner dashboard lives in your account. It takes a minute.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => router.push('/register?next=/partners')}>Create account</Button>
        <Button variant="secondary" onClick={() => router.push('/login?next=/partners')}>Sign in</Button>
      </div>
    </Card>
  );

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      <AppBackground />
      <header className="relative z-10 max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {initialLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={initialLogoUrl} alt="" className="w-8 h-8 rounded-lg object-contain bg-surface-elevated" />
          ) : <div className="w-8 h-8 rounded-lg bg-accent" />}
          <span className="text-sm font-extrabold tracking-[0.08em] uppercase text-white">{initialAppName}</span>
        </Link>
        <Link href={user ? '/partner' : '/login?next=/partner'} className="text-xs font-semibold text-text-secondary hover:text-white">Partner login</Link>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 pb-20 pt-6 space-y-10">
        <section className="text-center space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Partner program</p>
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">Send people who want to train.<br />Get paid every month they stay.</h1>
          <p className="text-sm sm:text-base text-text-secondary max-w-xl mx-auto">
            {initialAppName} partners earn <strong className="text-white">{cfg.defaultPercent}% of every payment</strong> from members who join through their link, for the life of the membership. Coaches, gym owners and creators who actually train people.
          </p>
          <a href="#apply" className="inline-flex items-center gap-1.5 text-sm font-bold text-black bg-accent rounded-full px-5 py-2.5 hover:opacity-90">Apply now <ArrowRight className="w-4 h-4" /></a>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          {perks.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-4 flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-accent" /></div>
              <div><p className="text-sm font-bold text-white">{title}</p><p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{body}</p></div>
            </Card>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-extrabold text-white">How it works</h2>
          <ol className="space-y-2">
            {[
              'Apply below. We review by hand, usually within two working days.',
              'Share your link or say your code. Anyone who signs up through it is attributed to you.',
              `They pay for a plan. You earn ${cfg.defaultPercent}% of the net amount of that payment, and of every renewal.`,
              `Commission clears after ${cfg.holdDays} days (our refund window). Refunds reverse it.`,
              'Connect your Stripe account. We pay out monthly.',
            ].map((t, i) => (
              <li key={t} className="flex gap-3 text-sm text-text-secondary"><span className="w-6 h-6 rounded-full bg-surface-elevated text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span><span className="pt-0.5">{t}</span></li>
            ))}
          </ol>
          <p className="text-xs text-text-tertiary">No self-referral, no spam, no bidding on our brand name in ads. The full agreement is in the form.</p>
        </section>

        <section id="apply" className="space-y-3">
          <h2 className="text-lg font-extrabold text-white">Apply</h2>
          {!cfg.enabled ? (
            <Card className="p-6 text-center"><p className="text-sm text-text-secondary">The partner program is not taking applications right now.</p></Card>
          ) : loading ? null : !user ? signedOutCta : existing ? (
            <Card className="p-6 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
              <p className="text-sm font-bold text-white">
                {existing.status === 'active' ? 'You are an active partner.' : existing.status === 'applied' ? 'Your application is under review.' : existing.status === 'suspended' ? 'Your partner account is paused.' : 'Your previous application was not approved.'}
              </p>
              {existing.status === 'rejected' ? (
                <Button onClick={() => setExisting(null)}>Apply again</Button>
              ) : (
                <Button onClick={() => router.push('/partner')}>Open partner dashboard</Button>
              )}
            </Card>
          ) : done ? (
            <Card className="p-6 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
              <p className="text-sm font-bold text-white">Application sent</p>
              <p className="text-sm text-text-secondary">Your code <span className="font-mono font-bold text-white">{done.code}</span> is reserved. We will email you when it is reviewed.</p>
              <Button variant="secondary" onClick={() => router.push('/partner')}>Check status</Button>
            </Card>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Card className="p-4 sm:p-5 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input label="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
                  <Input label="Email for payouts and statements" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={120} />
                </div>
                <Input label="Where will you promote? (Instagram @, YouTube, gym, newsletter…)" value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} required maxLength={500} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input label="Audience size (roughly)" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. 12k followers, 40 clients" maxLength={120} />
                  <Input label="Website (optional)" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" maxLength={200} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary" htmlFor="about">About you and your audience</label>
                  <textarea id="about" value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} required minLength={20} maxLength={2000} rows={4}
                    className="w-full rounded-xl bg-surface-elevated border border-white/10 px-3 py-2 text-sm text-white placeholder:text-text-tertiary outline-none focus:border-accent" placeholder="Who follows you, what you train, why they would want this." />
                </div>
                <Input label="Preferred code (optional)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="COACHMIKE" hint="3–20 letters or numbers. We issue one if it is taken." maxLength={20} />
              </Card>
              <Card className="p-4 sm:p-5 space-y-3">
                <p className="text-sm font-bold text-white">Partner agreement</p>
                <pre className="whitespace-pre-wrap text-xs text-text-secondary leading-relaxed max-h-48 overflow-y-auto font-sans">{cfg.agreementText}</pre>
                <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-0.5 accent-[#F5A623]" required />
                  <span>I have read and accept the partner agreement.</span>
                </label>
              </Card>
              <Button type="submit" fullWidth size="lg" disabled={busy || !form.agree}>{busy ? 'Sending…' : 'Send application'}</Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
