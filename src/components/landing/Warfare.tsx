'use client';

/**
 * The public homepage, built to the owner's two reference designs: one
 * composition for desktop and a separate one for phones. Dark and cinematic
 * throughout, orange as the only accent.
 *
 * Presentation only. Every button label and trial term is computed in
 * LandingClient from the live membership settings and passed in, so this file
 * can never promise terms the checkout does not honour. Numbers in the facts
 * row are real product figures, never invented user counts or ratings.
 *
 * Styles are the `wx-` classes at the end of globals.css.
 */

import Link from 'next/link';
import {
  ArrowRight, ChevronRight, Check, Play, ShieldCheck, Dumbbell, BarChart3, Target, Zap, Trophy, Apple,
} from 'lucide-react';
import { PhoneFrame, Reveal } from '@/components/landing/Redesign';
import { GooglePlayBadge } from '@/components/ui/GooglePlayBadge';
import { OperatorLine } from '@/components/ui/OperatorLine';
import { PLAY_TRADEMARK_LINE } from '@/lib/storeLinks';

/* eslint-disable @next/next/no-img-element */

const WORDMARK = '/brand/logo-wf.webp';

/** Each opens the quiz with that goal already chosen (onboarding reads ?goal=). */
const GOALS = [
  { goal: 'lose-fat', label: 'Lose fat', img: '/landing/card-nutrition.webp', pos: '35% 50%' },
  { goal: 'build-muscle', label: 'Build muscle', img: '/landing/card-training.webp', pos: '40% 45%' },
  { goal: 'strength', label: 'Get stronger', img: '/landing/hero-mobile.webp', pos: '55% 22%' },
  { goal: 'military-prep', label: 'Selection prep', img: '/landing/crest.webp', pos: '50% 50%' },
];

function GoalGrid() {
  return (
    <div className="wx-goals">
      {GOALS.map((g) => (
        <Link key={g.goal} href={`/onboarding?goal=${g.goal}`} className="wx-goal">
          <img src={g.img} alt="" loading="eager" style={{ objectPosition: g.pos }} />
          <b>{g.label}</b>
          <i aria-hidden><ChevronRight /></i>
        </Link>
      ))}
    </div>
  );
}

/** The two phones, rendered in 3D (Blender) with the real dashboard on the
 *  front one. The source scene is scripts/landing-phones/phones.py. */
function HeroPhones() {
  return <img src="/landing/phones.webp" alt="" aria-hidden className="wx-phones3d" width={1855} height={2022} fetchPriority="high" />;
}

export function WxHero({ ctaLabel, ctaNote, disclosure, onDemo }: {
  ctaLabel: string;
  /** e.g. "No credit card required", true for the trial as configured. */
  ctaNote: string;
  /** Renewal terms whenever the trial takes a card; null otherwise. */
  disclosure?: string | null;
  /** Only when the admin has uploaded a demo video. */
  onDemo?: () => void;
}) {
  // Only when there is a demo video to watch; no stand-in button otherwise.
  const demo = onDemo
    ? <button type="button" onClick={onDemo} className="wx-ghost"><Play aria-hidden /> Watch demo</button>
    : null;
  return (
    <section id="top" className="wx-hero">
      <div className="wx-hero-bg" aria-hidden>
        <picture>
          <source media="(min-width: 1024px)" srcSet="/landing/hero-battlefield.webp" />
          <img src="/landing/hero-mobile.webp" alt="" fetchPriority="high" />
        </picture>
      </div>

      {/* Desktop: the plan, the goal picker, the button. */}
      <div className="wx-hero-desk wx-enter">
        <p className="wx-eyebrow">Military-inspired training</p>
        <h1 className="wx-h1"><span>Your plan.</span><span className="wx-o">Built in 2 minutes.</span></h1>
        <p className="wx-hero-sub">Answer a few questions. Get a full training program, a calorie target and a coach that adjusts every week.</p>
        <span className="wx-rule" aria-hidden />
        <p className="wx-q">What&apos;s your goal?</p>
        <GoalGrid />
        <ul className="wx-trust">
          <li><Check aria-hidden /> {ctaNote === 'No credit card required' ? '7 days free' : 'Free trial'}</li>
          {ctaNote === 'No credit card required' && <li><Check aria-hidden /> No card</li>}
          <li><Check aria-hidden /> Cancel anytime</li>
        </ul>
        <Link href="/onboarding" className="wx-cta">{ctaLabel} <ArrowRight aria-hidden /></Link>
        {disclosure && <p className="wx-fine">{disclosure}</p>}
      </div>

      {/* Phone: the headline and two buttons, the app beside them. */}
      <div className="wx-hero-mob wx-enter">
        <p className="wx-eyebrow">Train • Progress • Dominate</p>
        <h1 className="wx-h1" aria-hidden><span>Build your</span><span className="wx-o">Perfect body</span></h1>
        <p className="wx-hero-sub">Military-inspired training for people who refuse to be average. Build strength. Build endurance. Build more.</p>
        <Link href="/onboarding" className="wx-cta">{ctaLabel} <ArrowRight aria-hidden /></Link>
        {demo}
        <p className="wx-note"><ShieldCheck aria-hidden /> {disclosure || ctaNote}</p>
      </div>

      <HeroPhones />
    </section>
  );
}

const STRIP = [
  { Icon: Dumbbell, title: 'Custom training plans', sub: 'For all levels' },
  { Icon: BarChart3, title: 'Track your progress', sub: 'In real-time' },
  { Icon: Target, title: 'Reach your goals', sub: 'Faster' },
  { Icon: ShieldCheck, title: 'Build strength', sub: '& Endurance' },
  { Icon: Trophy, title: 'Stay accountable', sub: 'With challenges' },
];

export function WxStrip() {
  return (
    <section className="wx-strip" aria-label="What you get">
      <ul>
        {STRIP.map(({ Icon, title, sub }) => (
          <li key={title}><Icon aria-hidden /><b>{title}</b><span>{sub}</span></li>
        ))}
      </ul>
    </section>
  );
}

/** Real product figures only. */
export function WxFacts({ facts }: { facts: { value: string; label: string }[] }) {
  if (!facts.length) return null;
  return (
    <section className="wx-facts" aria-label="The product in numbers">
      <dl>
        {facts.map((f) => <div key={f.label}><dt>{f.value}</dt><dd>{f.label}</dd></div>)}
      </dl>
    </section>
  );
}

const CARDS = [
  { title: 'Elite training programs', text: 'Advanced workout plans built for real results.', href: '/programs', img: '/landing/card-training.webp', pos: '40% 40%' },
  { title: 'Track every detail', text: 'Monitor your workouts, nutrition and progress.', href: '#screens', img: '/landing/card-tracking.webp', pos: '30% 45%' },
  { title: 'Nutrition guidance', text: 'Fuel your body with science-backed nutrition.', href: '#screens', img: '/landing/card-nutrition.webp', pos: '35% 50%' },
];

export function WxCards() {
  return (
    <section id="features" className="wx-cards">
      {CARDS.map((c, i) => (
        <Reveal key={c.title} delay={i * 80}>
          <a href={c.href} className="wx-card">
            <span className="wx-card-art"><img src={c.img} alt="" loading="lazy" decoding="async" style={{ objectPosition: c.pos }} /></span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <span className="wx-more">Learn more <ArrowRight aria-hidden /></span>
          </a>
        </Reveal>
      ))}
    </section>
  );
}

const CHECKS = ['Workout tracking', 'Nutrition', 'Hydration', 'Recovery', 'Challenges', 'Progress tracking', 'Community'];

export function WxCentre({ playUrl, iosUrl }: { playUrl: string; iosUrl?: string }) {
  return (
    <section id="screens" className="wx-centre">
      <div className="wx-centre-bg" aria-hidden />
      <Reveal className="wx-centre-copy">
        <h2 className="wx-h2"><span>Your training.</span><span>Your progress.</span><span className="wx-o">Your command centre.</span></h2>
        <p className="wx-centre-sub">A complete fitness platform in your pocket.</p>
        <ul className="wx-checks">{CHECKS.map((c) => <li key={c}><Check aria-hidden /> {c}</li>)}</ul>
        <div className="wx-stores">
          {iosUrl && <a href={iosUrl} target="_blank" rel="noopener noreferrer" className="wx-store"><Apple aria-hidden /> <span><small>Download on the</small>App Store</span></a>}
          <GooglePlayBadge href={playUrl} height={58} className="wx-play" />
          <Link href="/download" className="wx-ghost wx-dl"><Zap aria-hidden /> Download app</Link>
        </div>
      </Reveal>
      <div className="wx-fan" aria-hidden>
        <PhoneFrame src="/landing/app-training.webp" className="wx-fan-1" />
        <PhoneFrame src="/landing/app-home.webp" className="wx-fan-2" />
        <PhoneFrame src="/landing/app-nutrition.webp" className="wx-fan-3" />
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Create your profile', text: 'Tell us about your goals, experience and preferences.' },
  { title: 'Get your program', text: 'Receive a training plan built around your goals.' },
  { title: 'Train. Track. Progress.', text: 'Follow your workouts and monitor your development.' },
];

export function WxSteps() {
  return (
    <section className="wx-steps">
      <div className="wx-steps-head">
        <p className="wx-eyebrow">How it works</p>
        <h2 className="wx-h3">Three steps.<br />Then you just train.</h2>
      </div>
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="wx-num">{String(i + 1).padStart(2, '0')}</span>
            <span><b>{s.title}</b><small>{s.text}</small></span>
            {i < STEPS.length - 1 && <ArrowRight className="wx-step-arrow" aria-hidden />}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WxFinal({ ctaLabel, note }: { ctaLabel: string; note: string }) {
  return (
    <section className="wx-final">
      <img src="/home/mountain.webp" alt="" aria-hidden className="wx-final-bg" loading="lazy" decoding="async" />
      <Reveal className="wx-final-in">
        <h2 className="wx-h2 wx-final-title">Your <span className="wx-o">next level</span> starts now.</h2>
        <p>Stop waiting for the perfect moment. Build your strength, discipline and confidence.</p>
        <Link href="/onboarding" className="wx-cta">{ctaLabel} <ArrowRight aria-hidden /></Link>
        <small>{note}</small>
      </Reveal>
    </section>
  );
}

export function WxFooter({ appName, playUrl, iosUrl }: { appName: string; playUrl: string; iosUrl?: string }) {
  const col = (title: string, links: [string, string][]) => (
    <nav aria-label={title}>
      <h3>{title}</h3>
      {links.map(([label, href]) => href.startsWith('#')
        ? <a key={label} href={href}>{label}</a>
        : <Link key={label} href={href}>{label}</Link>)}
    </nav>
  );
  return (
    <footer className="wx-footer">
      <div className="wx-footer-grid">
        <div className="wx-footer-brand">
          <img src={WORDMARK} alt={appName} width={920} height={155} loading="lazy" />
          <p>Train harder. Live stronger.</p>
        </div>
        {col('Navigation', [['Home', '#top'], ['Programs', '/programs'], ['Standards', '/standards'], ['Challenges', '/challenges'], ['Ripz', '/ripz']])}
        {col('Features', [['Training plans', '/programs'], ['Nutrition', '#screens'], ['Progress tracking', '#screens'], ['Pricing', '#pricing'], ['FAQ', '#faq']])}
        {col('Company', [['For trainers', '/trainers'], ['Partners', '/partners'], ['Privacy Policy', '/privacy'], ['Terms & Conditions', '/terms'], ['Sign in', '/login']])}
        <div className="wx-footer-stores">
          {iosUrl && <a href={iosUrl} target="_blank" rel="noopener noreferrer" className="wx-store"><Apple aria-hidden /> <span><small>Download on the</small>App Store</span></a>}
          <GooglePlayBadge href={playUrl} height={56} />
        </div>
      </div>
      <div className="wx-footer-base">
        <div>
          <p>&copy; {new Date().getFullYear()} {appName}. All rights reserved.</p>
          <OperatorLine className="mt-1" />
        </div>
        <p>{PLAY_TRADEMARK_LINE}</p>
      </div>
    </footer>
  );
}

