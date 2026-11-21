'use client';

/**
 * The public homepage's cinematic sections: navigation, hero, feature strip,
 * product facts, feature cards, the app "command centre", how it works, the
 * closing call to action and the footer.
 *
 * These are presentation only. Every price, trial term and button label is
 * computed in LandingClient and passed in, so the page can never state terms
 * that differ from the pricing section below it. Styling lives under the
 * `lx-` classes in globals.css.
 *
 * Imagery is the app's own: the warrior and mountain art from the dashboard,
 * and real screenshots of the product in the phone frames. Nothing here is a
 * mock-up of a screen that does not exist.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Menu, X, PlayCircle, Dumbbell, LineChart, Trophy, Zap, ShieldCheck,
  Utensils, Droplets, Wind, Swords, Users, ClipboardList, Download, Apple, Play,
} from 'lucide-react';
import { GooglePlayBadge } from '@/components/ui/GooglePlayBadge';
import { OperatorLine } from '@/components/ui/OperatorLine';
import { PLAY_TRADEMARK_LINE } from '@/lib/storeLinks';

/* eslint-disable @next/next/no-img-element */

const WORDMARK = '/brand/logo-wf.webp';

/** Fades a section up the first time it scrolls into view. Without JS, or
 *  with reduced motion, the content is simply there. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lx-reveal ${seen ? 'is-in' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

/** A phone showing a real screenshot. `src` is 990×2000-ish; the frame keeps
 *  that ratio so nothing is cropped or stretched. */
export function PhoneFrame({ src, alt, className = '', priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`lx-phone ${className}`}>
      <div className="lx-phone-screen">
        <img src={src} alt={alt} width={560} height={1131} loading={priority ? 'eager' : 'lazy'} decoding="async" />
      </div>
    </div>
  );
}

/** The primary button. One look everywhere it appears. */
export function CtaButton({ href, children, sub, className = '' }: { href: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`lx-cta ${className}`}>
      <span className="lx-cta-label">{children} <ArrowRight className="w-5 h-5" aria-hidden /></span>
      {sub && <span className="lx-cta-sub">{sub}</span>}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────── Navigation

export interface NavLink { href: string; label: string }

export function LandingNav({ sections, pages, appName, showIos }: {
  /** In-page anchors shown in the bar. */
  sections: NavLink[];
  /** The site's other pages; they live in the menu and the footer. */
  pages: NavLink[];
  appName: string;
  showIos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('#top');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      // The last section whose top has passed under the bar is the active one.
      let cur = '#top';
      for (const s of sections) {
        if (!s.href.startsWith('#')) continue;
        const el = document.querySelector(s.href);
        if (el && el.getBoundingClientRect().top <= 120) cur = s.href;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

  return (
    <header className={`lx-nav ${scrolled || open ? 'is-solid' : ''}`}>
      <div className="lx-wrap flex items-center justify-between h-16 lg:h-20">
        <Link href="/" className="shrink-0" aria-label={`${appName} home`}>
          <img src={WORDMARK} alt={appName} width={920} height={155} className="h-7 lg:h-9 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-9" aria-label="Sections">
          {sections.map((l) => (
            <a key={l.href} href={l.href} className={`lx-nav-link ${active === l.href ? 'is-active' : ''}`}>{l.label}</a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-5">
          <Link href="/login" className="lx-nav-link">Sign In</Link>
          <Link href="/download" className="lx-pill">
            Download App
            {showIos && <Apple className="w-4 h-4" aria-hidden />}
            <Play className="w-4 h-4 text-accent" fill="currentColor" aria-hidden />
          </Link>
        </div>

        <button onClick={() => setOpen((v) => !v)} className="lg:hidden lx-icon-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden lx-menu">
          <div className="lx-wrap py-4 grid grid-cols-2 gap-x-6 gap-y-1">
            {[...sections, ...pages.filter((p) => p.href !== '/')].map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="lx-menu-link">{l.label}</a>
            ))}
          </div>
          <div className="lx-wrap pb-5 flex gap-3">
            <Link href="/login" onClick={() => setOpen(false)} className="lx-ghost flex-1 justify-center">Sign In</Link>
            <Link href="/download" onClick={() => setOpen(false)} className="lx-ghost flex-1 justify-center"><Download className="w-4 h-4" /> Get the app</Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────── Hero

/** For not printing the same sentence twice when the terms are one short line. */
const same = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

export function LandingHero({ eyebrow, line1, line2, sub, ctaLabel, ctaNote, disclosure, onDemo, playBadge, children }: {
  /** The feature strip and facts row, which sit inside the hero. */
  children?: ReactNode;
  eyebrow: string; line1: string; line2: string; sub: string;
  ctaLabel: string;
  /** The short line inside the button, e.g. "No credit card required". */
  ctaNote: string;
  /** Renewal terms, shown under the button whenever there are any. */
  disclosure?: string | null;
  /** Present only when the admin has uploaded a demo video. */
  onDemo?: () => void;
  playBadge?: ReactNode;
}) {
  return (
    <section id="top" className="lx-hero">
      {/* Atmosphere. Painted once; nothing here animates on a phone. */}
      <div className="lx-hero-bg" aria-hidden>
        <div className="lx-hero-grid" />
        <picture>
          <source media="(min-width: 1024px)" srcSet="/landing/hero-battlefield.webp" />
          <img src="/landing/hero-mobile.webp" alt="" className="lx-hero-art" fetchPriority="high" />
        </picture>
        <div className="lx-hero-streak" />
        <div className="lx-hero-fade" />
      </div>

      <div className="lx-wrap lx-hero-inner">
        <div className="lx-hero-copy lx-enter">
          <p className="lx-eyebrow">{eyebrow}</p>
          <h1 className="lx-display lx-hero-title">
            <span className="lx-chrome">{line1}</span>
            <span className="lx-orange">{line2}</span>
          </h1>
          <p className="lx-hero-sub">{sub}</p>

          <div className="lx-hero-actions">
            <CtaButton href="/onboarding" sub={ctaNote}>{ctaLabel}</CtaButton>
            {onDemo ? (
              <button onClick={onDemo} className="lx-demo">
                <span className="lx-demo-icon"><PlayCircle className="w-7 h-7" aria-hidden /></span>
                <span><b>Watch Demo</b><small>See the app in action</small></span>
              </button>
            ) : (
              <a href="#screens" className="lx-demo">
                <span className="lx-demo-icon"><PlayCircle className="w-7 h-7" aria-hidden /></span>
                <span><b>See the App</b><small>Real screens, no mock-ups</small></span>
              </a>
            )}
            {playBadge && <div className="lx-hero-badge">{playBadge}</div>}
          </div>
          {disclosure && same(disclosure) !== same(ctaNote) && <p className="lx-fine">{disclosure}</p>}
          {children}
        </div>

        {/* Product, in the hand. Desktop only: on a phone the visitor is
            already holding one, and the screens get their own section. */}
        <div className="lx-hero-phones" aria-hidden>
          <PhoneFrame src="/landing/web-mobile.webp" alt="" className="lx-phone-back lx-float-b" priority />
          <PhoneFrame src="/landing/app-home.webp" alt="" className="lx-phone-front lx-float-a" priority />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────── Feature strip

const STRIP = [
  { Icon: Dumbbell, title: 'Custom Training Plans', sub: 'For all levels' },
  { Icon: LineChart, title: 'Track Your Progress', sub: 'In real time' },
  { Icon: Trophy, title: 'Reach Your Goals', sub: 'Faster' },
  { Icon: Zap, title: 'Build Strength', sub: '& endurance' },
  { Icon: ShieldCheck, title: 'Stay Accountable', sub: 'With challenges' },
];

export function FeatureStrip() {
  return (
    <section className="lx-wrap lx-strip-wrap" aria-label="What you get">
      <Reveal>
        <ul className="lx-panel lx-strip">
          {STRIP.map(({ Icon, title, sub }) => (
            <li key={title}>
              <Icon className="w-8 h-8 text-accent" aria-hidden />
              <b>{title}</b>
              <span>{sub}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

// ──────────────────────────────────────────────────────────── Product facts

/** Facts about the product, each one true of the app as it stands. Counts of
 *  members appear only once there are enough for the number to be real. */
const FACT_ICONS = [Dumbbell, PlayCircle, Trophy];

export function FactsBar({ facts }: { facts: { value: string; label: string }[] }) {
  if (!facts.length) return null;
  return (
    <section className="lx-wrap lx-facts-wrap" aria-label="The product in numbers">
      <Reveal className="lx-facts">
        <dl>
          {facts.map((f, i) => {
            const Icon = FACT_ICONS[i % FACT_ICONS.length];
            return (
              <div key={f.label}>
                <Icon className="lx-fact-icon" aria-hidden />
                <span><dt>{f.value}</dt><dd>{f.label}</dd></span>
              </div>
            );
          })}
        </dl>
        <p className="lx-display lx-facts-tag"><span className="lx-chrome">Train smarter.</span> <span className="lx-orange">Get stronger.</span></p>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────── Feature cards

export function FeatureCards() {
  const cards = [
    { title: 'Elite Training Programs', text: 'Advanced workout plans built for real results.', href: '/programs', img: '/landing/card-training.webp', alt: 'An athlete doing push-ups in a dark gym', phone: false },
    { title: 'Track Every Detail', text: 'Monitor your workouts, nutrition and progress.', href: '#screens', img: '/landing/card-tracking.webp', alt: 'A phone showing a rising progress chart', phone: false },
    { title: 'Nutrition Guidance', text: 'Fuel your body with science-backed nutrition.', href: '#screens', img: '/landing/card-nutrition.webp', alt: 'Sliced steak with vegetables on a dark tray', phone: false },
  ];
  return (
    <section id="features" className="lx-wrap lx-section">
      <div className="lx-cards">
        {cards.map((c, i) => (
          <Reveal key={c.title} delay={i * 80}>
            <a href={c.href} className="lx-card">
              <div className={`lx-card-art ${c.phone ? 'is-phone' : ''}`}>
                <img src={c.img} alt={c.alt} loading="lazy" decoding="async" />
              </div>
              <div className="lx-card-body">
                <h3 className="lx-label">{c.title}</h3>
                <p>{c.text}</p>
                <span className="lx-more">Learn more <ArrowRight className="w-4 h-4" aria-hidden /></span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────── App experience

const SCREENS = [
  { key: 'tracking', Icon: ClipboardList, label: 'Workout tracking', img: '/landing/app-set.webp', text: 'Weight and reps in two taps. It remembers last time and tells you what to beat.' },
  { key: 'programs', Icon: Dumbbell, label: 'Training programs', img: '/landing/app-training.webp', text: 'A program matched to you, with every session already written out.' },
  { key: 'nutrition', Icon: Utensils, label: 'Nutrition', img: '/landing/app-nutrition.webp', text: 'Calories and macros set from your stats. Log a meal from a photo or a barcode.' },
  { key: 'hydration', Icon: Droplets, label: 'Hydration', img: '/landing/app-nutrition.webp', text: 'A daily water target and one-tap logging, on the same screen as your food.' },
  { key: 'recovery', Icon: Wind, label: 'Recovery', img: '/landing/app-breathing.webp', text: 'Guided breathing for before a lift, after a session, or before sleep.' },
  { key: 'challenges', Icon: Swords, label: 'Challenges', img: '/landing/app-quests.webp', text: 'Missions, streaks and badges that only count work you actually did.' },
  { key: 'progress', Icon: LineChart, label: 'Progress tracking', img: '/landing/app-coach.webp', text: 'A weekly read on your training and food, and the one thing to do next.' },
  { key: 'community', Icon: Users, label: 'Community', img: '/landing/app-community.webp', text: 'Post a win, see the PR wall, join a challenge with everyone else.' },
];

export function CommandCentre() {
  const [i, setI] = useState(0);
  const cur = SCREENS[i];
  return (
    <section id="screens" className="lx-section lx-centre">
      <div className="lx-wrap lx-centre-grid">
        <Reveal className="lx-centre-copy">
          <p className="lx-eyebrow">The app</p>
          <h2 className="lx-display lx-h2">
            <span className="lx-chrome">Your training.</span>
            <span className="lx-chrome">Your progress.</span>
            <span className="lx-orange">Your command centre.</span>
          </h2>
          <p className="lx-lead">One platform for the whole job, not a folder of workout PDFs. Tap through the real screens.</p>

          <div className="lx-tabs" role="tablist" aria-label="App screens">
            {SCREENS.map((s, n) => (
              <button key={s.key} role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`lx-tab ${n === i ? 'is-on' : ''}`}>
                <s.Icon className="w-4 h-4" aria-hidden /> {s.label}
              </button>
            ))}
          </div>
          <p className="lx-tab-text" aria-live="polite">{cur.text}</p>
        </Reveal>

        <Reveal className="lx-centre-stage" delay={120}>
          <div className="lx-stage-glow" aria-hidden />
          <PhoneFrame src={SCREENS[(i + SCREENS.length - 1) % SCREENS.length].img} alt="" className="lx-stage-side is-left" />
          <PhoneFrame src={SCREENS[(i + 1) % SCREENS.length].img} alt="" className="lx-stage-side is-right" />
          <PhoneFrame key={cur.key} src={cur.img} alt={`${cur.label} in the Warfare Fitness app`} className="lx-stage-main" />
        </Reveal>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── How it works

export function HowItWorks() {
  const steps = [
    { n: '01', title: 'Create your profile', text: 'Tell us about your goals, experience and training preferences.' },
    { n: '02', title: 'Get your program', text: 'Receive a training experience built around your goals.' },
    { n: '03', title: 'Train. Track. Progress.', text: 'Follow your workouts and monitor your development.' },
  ];
  return (
    <section className="lx-wrap lx-section">
      <Reveal className="text-center">
        <p className="lx-eyebrow">How it works</p>
        <h2 className="lx-display lx-h2"><span className="lx-chrome">Three steps.</span> <span className="lx-orange">Two minutes.</span></h2>
      </Reveal>
      <ol className="lx-steps">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 90}>
            <li className="lx-step">
              <span className="lx-display lx-step-n">{s.n}</span>
              <h3 className="lx-label">{s.title}</h3>
              <p>{s.text}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────── Final CTA

export function FinalCta({ ctaLabel, note, disclosure }: { ctaLabel: string; note: string; disclosure?: string | null }) {
  return (
    <section className="lx-final">
      <img src="/home/mountain.webp" alt="" aria-hidden className="lx-final-bg" loading="lazy" decoding="async" />
      <div className="lx-final-fade" aria-hidden />
      <Reveal className="lx-wrap lx-final-inner">
        <h2 className="lx-display lx-final-title"><span className="lx-chrome">Your next level</span> <span className="lx-orange">starts now.</span></h2>
        <p className="lx-lead mx-auto">Stop waiting for the perfect moment. Build your strength, discipline and confidence.</p>
        <CtaButton href="/onboarding" className="mx-auto mt-8">{ctaLabel}</CtaButton>
        <p className="lx-fine text-center">{disclosure && same(disclosure) !== same(note) ? disclosure : note}</p>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────── Footer

export function LandingFooter({ appName, sections, pages, playUrl, iosUrl }: {
  appName: string; sections: NavLink[]; pages: NavLink[]; playUrl: string; iosUrl?: string;
}) {
  return (
    <footer className="lx-footer">
      <div className="lx-wrap lx-footer-grid">
        <div className="lx-footer-brand">
          <img src={WORDMARK} alt={appName} width={920} height={155} className="h-8 w-auto" loading="lazy" />
          <p>Military-inspired training, nutrition and accountability in one app. Your program, your numbers, your next move.</p>
        </div>
        <nav aria-label="On this page">
          <h3>Product</h3>
          {sections.filter((s) => s.href !== '#top').map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <nav aria-label="Site">
          <h3>Explore</h3>
          {pages.filter((p) => !['/', '/privacy', '/terms'].includes(p.href)).map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <nav aria-label="Legal and contact">
          <h3>Company</h3>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms and Conditions</Link>
          <Link href="/login">Sign In</Link>
        </nav>
        <div>
          <h3>Get the app</h3>
          <GooglePlayBadge href={playUrl} height={54} className="-ml-2" />
          {iosUrl && <a href={iosUrl} target="_blank" rel="noopener noreferrer">Download on the App Store</a>}
        </div>
      </div>
      <div className="lx-wrap lx-footer-base">
        <div>
          <p>&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
          <OperatorLine className="mt-1" />
        </div>
        <p>{PLAY_TRADEMARK_LINE}</p>
      </div>
    </footer>
  );
}
