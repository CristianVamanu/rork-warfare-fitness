'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  ArrowRight, Check, Crown, Menu, X as XIcon,
  Palette, DollarSign, Sparkles, Users2, Apple, MessageSquare,
  Flame, LayoutDashboard, Rocket, ChevronDown, ShieldCheck, XCircle, Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getSystemConfig, createTrainerLead } from '@/lib/firestore';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_B2B_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { B2BLandingConfig } from '@/types';

// Icon stays fixed by position — only title/desc are admin-editable.
const REASON_ICONS = [Palette, DollarSign, Sparkles, Users2, Apple, Flame, LayoutDashboard, Rocket];

const NAV_LINKS = [
  { href: '/', label: 'For Athletes' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/b2b-terms', label: 'B2B Terms' },
];

export default function TrainersLandingPage({
  initialAppName,
  initialLogoUrl,
  initialConfig,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
  initialConfig: B2BLandingConfig;
}) {
  const [appName, setAppName] = useState(initialAppName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [config, setConfig] = useState<B2BLandingConfig>(initialConfig);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoOpenForm, setDemoOpenForm] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
      if (cfg?.b2bLandingPage) setConfig({ ...DEFAULT_B2B_LANDING_CONFIG, ...(cfg.b2bLandingPage as B2BLandingConfig) });
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      {/* Header */}
      <header className="relative z-20 border-b border-white/8">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/trainers" className="flex items-center gap-2">
            {logoUrl ? (
              <Image src={logoUrl} alt={appName} width={32} height={32} className="rounded-lg" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <Crown className="w-4 h-4 text-black" />
              </div>
            )}
            <span className="font-black text-white text-lg">{appName}</span>
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-accent bg-accent-muted px-2 py-0.5 rounded-full ml-1">For Trainers</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
            <Button size="sm" onClick={() => setDemoOpenForm(true)}>
              {config.ctaPrimaryLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </nav>

          <button className="md:hidden text-white" onClick={() => setMobileMenuOpen((v) => !v)}>
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="md:hidden border-t border-white/8 px-4 py-3 space-y-3">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="block text-sm font-medium text-text-secondary" onClick={() => setMobileMenuOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Button size="sm" fullWidth onClick={() => { setMobileMenuOpen(false); setDemoOpenForm(true); }}>
              {config.ctaPrimaryLabel}
            </Button>
          </motion.div>
        )}
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="orb-drift pointer-events-none absolute rounded-full blur-3xl -top-20 -right-20 w-80 h-80 bg-accent/10" aria-hidden="true" />
        <div className="max-w-6xl mx-auto px-4 pt-14 pb-16 grid md:grid-cols-2 gap-10 items-center relative">
          <div className="text-center flex flex-col items-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-muted border border-accent/20 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-bold text-accent">{config.badgeText}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.08] mb-4">
              {config.headlineLine1} <span className="text-accent">{config.headlineLine2}</span>
            </h1>
            <p className="text-base text-text-secondary leading-relaxed mb-7 max-w-md">
              {config.subheadline}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => setDemoOpenForm(true)}>
                {config.ctaPrimaryLabel} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="relative flex justify-center">
            {config.heroDemoVideoUrl ? (
              <InlineHeroVideo src={config.heroDemoVideoUrl} posterUrl={config.heroDemoPosterUrl || config.heroImageUrl} />
            ) : config.heroImageUrl ? (
              <img src={config.heroImageUrl} alt="Your branded app" className="max-h-[560px] max-w-full w-auto h-auto rounded-2xl border border-white/10" />
            ) : (
              <div className="w-full aspect-[4/3] rounded-2xl border border-dashed border-white/15 flex items-center justify-center">
                <p className="text-xs text-text-tertiary text-center px-6">Add a hero image or demo video from Admin → B2B Landing Page</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Not "just a website" — a real installable PWA app */}
      <section className="max-w-4xl mx-auto px-4 py-14 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-muted border border-accent/20 mb-4">
          <Smartphone className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-bold text-accent">Progressive Web App</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">{config.pwaHeadline}</h2>
        <p className="text-sm text-text-secondary max-w-2xl mb-10">{config.pwaSubheadline}</p>
        <div className="w-full rounded-2xl border border-white/10 overflow-hidden text-center">
          <div className="grid grid-cols-3 bg-white/[0.03] text-xs font-bold uppercase tracking-wide text-text-tertiary">
            <div className="p-3.5"></div>
            <div className="p-3.5 flex items-center justify-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-danger" /> App Store / Play Store</div>
            <div className="p-3.5 flex items-center justify-center gap-1.5 text-accent"><ShieldCheck className="w-3.5 h-3.5" /> Our PWA</div>
          </div>
          {config.pwaPoints.map((row, i) => (
            <div key={row.label} className={`grid grid-cols-3 text-sm ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
              <div className="p-3.5 font-semibold text-white">{row.label}</div>
              <div className="p-3.5 text-text-secondary">{row.native}</div>
              <div className="p-3.5 text-white font-medium">{row.pwa}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Reasons */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-2">Why coaches choose {appName}</h2>
        <p className="text-sm text-text-secondary text-center max-w-lg mx-auto mb-10">
          Everything you need to run a real client experience — without hiring a dev team.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {config.reasons.map((r, i) => {
            const Icon = REASON_ICONS[i] ?? MessageSquare;
            return (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="rounded-2xl border border-white/8 bg-surface p-5 flex flex-col items-center text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">{r.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{r.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Build-it-yourself vs buy-it comparison — the core price justification */}
      <section className="max-w-4xl mx-auto px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10">{config.comparisonHeadline}</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden text-center">
          <div className="grid grid-cols-3 bg-white/[0.03] text-xs font-bold uppercase tracking-wide text-text-tertiary">
            <div className="p-3.5"></div>
            <div className="p-3.5 flex items-center justify-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-danger" /> Building It Yourself</div>
            <div className="p-3.5 flex items-center justify-center gap-1.5 text-accent"><ShieldCheck className="w-3.5 h-3.5" /> Buying It From Us</div>
          </div>
          {config.comparisonPoints.map((row, i) => (
            <div key={row.label} className={`grid grid-cols-3 text-sm ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
              <div className="p-3.5 font-semibold text-white">{row.label}</div>
              <div className="p-3.5 text-text-secondary">{row.diy}</div>
              <div className="p-3.5 text-white font-medium">{row.us}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-2">Simple, predictable pricing</h2>
        <p className="text-sm text-text-secondary text-center max-w-lg mx-auto mb-10">
          One flat, one-time fee — not monthly — secured with a small deposit ($400–500), balance due on handoff. You keep 100% of what you charge your own clients.
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          {config.pricingTiers.map((tier) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.3 }}
              className={`relative rounded-2xl p-5 h-full flex flex-col items-center text-center border ${tier.highlighted ? 'border-accent/40 bg-accent-muted/30' : 'border-white/10 bg-surface'}`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-accent rounded-full">
                  <span className="text-[10px] font-bold text-black uppercase tracking-wide">Most Popular</span>
                </div>
              )}
              <p className="text-xs font-bold text-accent uppercase tracking-wide">{tier.name}</p>
              <div className="flex items-baseline justify-center gap-1 mt-2">
                <span className="text-3xl font-black text-white">{tier.price === 'Custom' ? 'Custom' : `$${tier.price}`}</span>
                {tier.period && <span className="text-xs text-text-secondary">{tier.period}</span>}
              </div>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">{tier.description}</p>
              <ul className="mt-4 space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center justify-center gap-2 text-xs text-text-secondary">
                    <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button fullWidth size="md" variant={tier.highlighted ? 'primary' : 'secondary'} className="mt-5" onClick={() => setDemoOpenForm(true)}>
                {config.ctaPrimaryLabel} <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </div>
        {config.guaranteeText && (
          <p className="text-xs text-text-tertiary text-center mt-6 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {config.guaranteeText}
          </p>
        )}
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-8">Questions, answered</h2>
        <div className="rounded-2xl border border-white/8 bg-surface px-5">
          {config.faqs.map((item, i) => (
            <div key={item.q} className="border-b border-white/8 last:border-b-0 text-center">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-center gap-4 py-4">
                <span className="text-sm font-semibold text-white">{item.q}</span>
                <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-sm text-text-secondary leading-relaxed pb-4"
                >
                  {item.a}
                </motion.p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">{config.finalCtaHeadline}</h2>
        <p className="text-sm text-text-secondary mb-7 max-w-md mx-auto">{config.finalCtaSubtext}</p>
        <Button size="lg" onClick={() => setDemoOpenForm(true)}>
          {config.ctaPrimaryLabel} <ArrowRight className="w-4 h-4" />
        </Button>
      </section>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-tertiary">
          <span>© {new Date().getFullYear()} {appName}</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white transition-colors">For Athletes</Link>
            <Link href="/b2b-terms" className="hover:text-white transition-colors">B2B Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>

      <DemoRequestModal open={demoOpenForm} onClose={() => setDemoOpenForm(false)} />
    </div>
  );
}

// Autoplays muted (required by every browser's autoplay policy) directly in
// the hero — no click-to-open modal. A tap on the speaker icon unmutes in
// place instead of navigating away from the page.
// No fixed aspect ratio on the wrapper — forcing a 4:3 landscape box around
// a portrait phone-screen recording (the common case for an app demo) was
// pillarboxing it with black bars on both sides. Sizing to the video's own
// natural dimensions instead removes the bars regardless of orientation.
function InlineHeroVideo({ src, posterUrl }: { src: string; posterUrl?: string }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto max-w-full w-fit">
      <video
        src={src}
        poster={posterUrl}
        autoPlay
        loop
        muted
        playsInline
        controls
        className="block max-h-[560px] max-w-full w-auto h-auto mx-auto"
      />
    </div>
  );
}

function DemoRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [clientCount, setClientCount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error('Enter your name and a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await createTrainerLead({
        name: name.trim(),
        email: email.trim(),
        businessName: businessName.trim() || undefined,
        phone: phone.trim() || undefined,
        clientCount: clientCount || undefined,
        message: message.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      toast.error('Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    onClose();
    // Reset after the close animation rather than mid-fade
    setTimeout(() => {
      setSubmitted(false);
      setName(''); setEmail(''); setBusinessName(''); setPhone(''); setClientCount(''); setMessage('');
    }, 300);
  }

  return (
    <Modal open={open} onClose={handleClose} title={submitted ? "You're on the list!" : 'Book a Demo'}>
      {submitted ? (
        <div className="text-center py-4">
          <p className="text-sm text-text-secondary">Thanks — we'll reach out to {email} shortly to schedule your demo.</p>
          <Button fullWidth className="mt-5" onClick={handleClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary"
            placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required
          />
          <input
            type="email"
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary"
            placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required
          />
          <input
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary"
            placeholder="Business / gym name (optional)" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
          />
          <input
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary"
            placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)}
          />
          <select
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white"
            value={clientCount} onChange={(e) => setClientCount(e.target.value)}
          >
            <option value="">How many clients do you have?</option>
            <option value="1-10">1–10</option>
            <option value="11-25">11–25</option>
            <option value="26-100">26–100</option>
            <option value="100+">100+</option>
          </select>
          <textarea
            className="w-full bg-surface-elevated border border-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none"
            placeholder="Anything else we should know? (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" fullWidth loading={submitting}>Request Demo</Button>
        </form>
      )}
    </Modal>
  );
}
