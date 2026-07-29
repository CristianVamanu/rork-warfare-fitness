'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Apple, Smartphone, Monitor, Share, MoreVertical, PlusSquare,
  ArrowRight, Crown, Menu, X as XIcon, Zap, Download,
} from 'lucide-react';
import { getSystemConfig } from '@/lib/firestore';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/#programs', label: 'Programs' },
  { href: '/download', label: 'Download App' },
];

const PLATFORMS = [
  {
    id: 'ios',
    icon: Apple,
    label: 'iPhone & iPad',
    eyebrow: 'Safari',
    steps: [
      { icon: null, text: <>Open the app in <strong className="text-white">Safari</strong> and log in (or sign up).</> },
      { icon: Share, text: <>Tap the <strong className="text-white">Share icon</strong> — the square with an up-arrow, at the bottom of the screen on iPhone, or top-right on iPad.</> },
      { icon: PlusSquare, text: <>Scroll down and tap <strong className="text-white">&quot;Add to Home Screen.&quot;</strong></> },
      { icon: null, text: <>Tap <strong className="text-white">&quot;Add&quot;</strong> in the top-right. The app is now on your home screen.</> },
    ],
  },
  {
    id: 'android',
    icon: Smartphone,
    label: 'Android',
    eyebrow: 'Chrome',
    steps: [
      { icon: null, text: <>Open the app in <strong className="text-white">Chrome</strong> and log in (or sign up).</> },
      { icon: MoreVertical, text: <>Tap the <strong className="text-white">three-dot menu</strong> in the top-right.</> },
      { icon: null, text: <>Tap <strong className="text-white">&quot;Install app&quot;</strong> (or &quot;Add to Home screen&quot;).</> },
      { icon: null, text: <>Tap <strong className="text-white">&quot;Install&quot;</strong> to confirm. The app lands in your app drawer and home screen.</> },
    ],
  },
  {
    id: 'desktop',
    icon: Monitor,
    label: 'Desktop',
    eyebrow: 'Chrome, Edge, Brave & similar',
    steps: [
      { icon: null, text: <>Open the app in <strong className="text-white">Chrome, Edge, Brave</strong>, or a similar browser.</> },
      { icon: Download, text: <>Find the <strong className="text-white">install icon</strong> (a monitor with a down-arrow) at the right of the address bar.</> },
      { icon: null, text: <>Click it, then click <strong className="text-white">&quot;Install.&quot;</strong></> },
      { icon: null, text: <>The app opens in its own window and pins to your taskbar or dock.</> },
    ],
  },
];

export default function DownloadClient({
  initialAppName,
  initialLogoUrl,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
}) {
  const [appName, setAppName] = useState(initialAppName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<string>('ios');

  useEffect(() => {
    getSystemConfig().then((cfg) => {
      if (cfg?.appName) setAppName(cfg.appName as string);
      if (cfg?.logoUrl) setLogoUrl(cfg.logoUrl as string);
    }).catch(() => {});
  }, []);

  function scrollToPlatform(id: string) {
    setActivePlatform(id);
    document.getElementById(`platform-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      {/* Header */}
      <header className="relative z-20 border-b border-white/8">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {logoUrl ? (
              <Image src={logoUrl} alt={appName} width={32} height={32} className="rounded-lg" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <Crown className="w-4 h-4 text-black" />
              </div>
            )}
            <span className="font-black text-white text-lg">{appName}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
            <Link href="/">
              <button className="px-4 py-2 rounded-xl bg-accent text-black text-sm font-bold flex items-center gap-1.5 hover:brightness-110 transition-all">
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
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
          </motion.div>
        )}
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="orb-drift pointer-events-none absolute rounded-full blur-3xl -top-16 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-accent/10" aria-hidden="true" />
        <div className="max-w-3xl mx-auto px-4 pt-14 pb-10 text-center relative">
          {/* Platform quick-jump pills */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-white/10 bg-surface mb-8">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => scrollToPlatform(p.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  activePlatform === p.id ? 'bg-accent text-black' : 'text-text-secondary hover:text-white'
                }`}
              >
                <p.icon className="w-3.5 h-3.5" /> {p.label}
              </button>
            ))}
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.08] mb-4">
            Download <span className="text-accent">{appName}</span>
          </h1>
          <p className="text-base text-text-secondary leading-relaxed mb-8 max-w-lg mx-auto">
            Install {appName} on any device in under 30 seconds — no App Store, no waiting on a review. Just open your browser, tap install, and start training.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
            <Link href="/">
              <button className="px-6 py-3.5 rounded-2xl bg-accent text-black text-base font-bold flex items-center gap-2 hover:brightness-110 transition-all shadow-glow-sm">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <a href="#how-to-install">
              <button className="px-6 py-3.5 rounded-2xl bg-surface-elevated border border-border text-white text-base font-bold hover:bg-white/5 transition-colors">
                How to Install ↓
              </button>
            </a>
          </div>

          {/* Decorative device mockup — purely illustrative, no real screenshot dependency */}
          <div className="relative mx-auto w-[220px] sm:w-[240px]">
            <div className="relative rounded-[2.2rem] border-4 border-white/15 bg-surface shadow-2xl overflow-hidden aspect-[9/19]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-b-2xl z-10" />
              <div className="w-full h-full bg-gradient-to-b from-surface-elevated to-background p-4 pt-9 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 mb-1">
                  {logoUrl ? (
                    <Image src={logoUrl} alt={appName} width={20} height={20} className="rounded-md" />
                  ) : (
                    <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center"><Crown className="w-3 h-3 text-black" /></div>
                  )}
                  <div className="h-2 w-16 rounded-full bg-white/15" />
                </div>
                {[0.85, 1, 0.7].map((w, i) => (
                  <div key={i} className="rounded-xl bg-white/[0.06] border border-white/8 p-2.5" style={{ width: `${w * 100}%` }}>
                    <div className="h-2 w-2/3 rounded-full bg-white/20 mb-1.5" />
                    <div className="h-1.5 w-1/3 rounded-full bg-accent/50" />
                  </div>
                ))}
                <div className="mt-auto rounded-xl bg-accent/90 p-2 flex items-center justify-center gap-1.5">
                  <Zap className="w-3 h-3 text-black" />
                  <div className="h-1.5 w-12 rounded-full bg-black/40" />
                </div>
              </div>
            </div>
            <div className="absolute -inset-6 rounded-[3rem] bg-accent/10 blur-3xl -z-10" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* Instructions */}
      <section id="how-to-install" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-2">Pick your platform</h2>
        <p className="text-sm text-text-secondary text-center max-w-lg mx-auto mb-10">
          {appName} runs as a Progressive Web App — install it directly from your browser, no app store required.
        </p>

        <div className="grid md:grid-cols-3 gap-5">
          {PLATFORMS.map((platform, pIdx) => (
            <motion.div
              key={platform.id}
              id={`platform-${platform.id}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.3, delay: pIdx * 0.05 }}
              className="rounded-2xl border border-white/10 bg-surface p-5 scroll-mt-24"
            >
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent mb-2">{platform.eyebrow}</p>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center">
                  <platform.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-lg font-black text-white">{platform.label}</h3>
              </div>
              <ol className="space-y-3">
                {platform.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-text-secondary leading-relaxed">{step.text}</p>
                      {step.icon && (
                        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/8">
                          <step.icon className="w-3.5 h-3.5 text-accent" />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Ready to get started?</h2>
        <p className="text-sm text-text-secondary mb-7 max-w-md mx-auto">
          Create your account, get matched to a program, and install {appName} in under a minute.
        </p>
        <Link href="/">
          <button className="px-6 py-3.5 rounded-2xl bg-accent text-black text-base font-bold inline-flex items-center gap-2 hover:brightness-110 transition-all shadow-glow-sm">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </section>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-tertiary">
          <span>© {new Date().getFullYear()} {appName}</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
