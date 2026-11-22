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
  ArrowRight, ChevronRight, ChevronDown, Check, Play, ShieldCheck, Dumbbell, BarChart3, Target, Zap, Trophy, Apple, TrendingUp, PlayCircle, CalendarCheck, Flame, Users,
} from 'lucide-react';
import { useState } from 'react';
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
  return <img src="/landing/phones.webp" alt="" aria-hidden className="wx-phones3d" width={1806} height={2007} fetchPriority="high" />;
}

const same = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

export function WxHero({ ctaLabel, ctaNote, disclosure, priceLine, onDemo, facts = [] }: {
  /** Real product figures for the phone hero's numbers card. */
  facts?: { value: string; label: string }[];
  /** "7 days free, then $X/mo. Cancel anytime." from the live plans. */
  priceLine?: string | null;
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
        <p className="wx-hero-sub">Answer a few questions. Get a full training program, a calorie target and a coach that adjusts every week. No experience needed.</p>
        <span className="wx-rule" aria-hidden />
        <p className="wx-q">What&apos;s your goal?</p>
        <GoalGrid />
        <ul className="wx-trust">
          <li><Check aria-hidden /> {ctaNote === 'No credit card required' ? '7 days free' : 'Free trial'}</li>
          {ctaNote === 'No credit card required' && <li><Check aria-hidden /> No card</li>}
          <li><Check aria-hidden /> Cancel anytime</li>
        </ul>
        <Link href="/onboarding" className="wx-cta">{ctaLabel} <ArrowRight aria-hidden /></Link>
        {(disclosure || priceLine) && <p className="wx-fine">{disclosure || priceLine}</p>}
      </div>

      {/* Phone: the headline and two buttons, the app beside them. */}
      <div className="wx-hero-mob wx-enter">
        <p className="wx-eyebrow">Train • Progress • Dominate</p>
        <h1 className="wx-h1" aria-hidden><span>Build your</span><span className="wx-o">Perfect body</span></h1>
        <p className="wx-hero-sub">Military-inspired training for real people. No experience needed. Home or gym, matched to you in 2 minutes.</p>
        <Link href="/onboarding" className="wx-cta">{ctaLabel} <ArrowRight aria-hidden /></Link>
        {demo}
        <p className="wx-note"><ShieldCheck aria-hidden /> {disclosure || priceLine || ctaNote}</p>
        {/* One tap about themselves gets more people into the quiz than a
            button alone. Each card opens it with that goal chosen. */}
        <div className="wx-mgoals">
          <p className="wx-q">What&apos;s your goal?</p>
          <GoalGrid />
        </div>
      </div>

      <HeroPhones />

      {/* Phone hero, the owner's mobile reference: full-width warrior,
          centred headline, three promises, the numbers, one big button. */}
      <div className="wx-m2">
        <img src="/landing/hero-mobile2.webp" alt="" className="wx-m2-art" fetchPriority="high" />
        <div className="wx-m2-in">
          <h1 className="wx-h1 wx-m2-h1" aria-hidden><span>Build your</span><span className="wx-o">Perfect body</span></h1>
          <p className="wx-m2-tag">Train <i>•</i> Progress <i>•</i> Dominate</p>
          <p className="wx-m2-sub">Military-inspired training for real people. No experience needed. Home or gym, matched to you in 2 minutes.</p>
          <ul className="wx-m2-icons">
            <li><Dumbbell aria-hidden /><span>Custom<br />programs</span></li>
            <li><TrendingUp aria-hidden /><span>Track<br />progress</span></li>
            <li><Trophy aria-hidden /><span>Reach<br />your goals</span></li>
          </ul>
          {facts.length > 0 && (
            <dl className="wx-m2-facts">
              {facts.map((f, i) => {
                const Icon = [Dumbbell, PlayCircle, CalendarCheck][i % 3];
                return <div key={f.label}><Icon aria-hidden /><dt>{f.value}</dt><dd>{f.label}</dd></div>;
              })}
            </dl>
          )}
          <Link href="/onboarding" className="wx-m2-cta">
            <span>{ctaLabel} <ArrowRight aria-hidden /></span>
            <small>{ctaNote}</small>
          </Link>
          {(disclosure || priceLine) && same(disclosure || priceLine || '') !== same(ctaNote) && <p className="wx-m2-price">{disclosure || priceLine}</p>}
          {onDemo && <button type="button" onClick={onDemo} className="wx-m2-demo"><Play aria-hidden /> Watch demo</button>}
          <div className="wx-mgoals">
            <p className="wx-q">What&apos;s your goal?</p>
            <GoalGrid />
          </div>
          <a href="#features" className="wx-m2-join">Join the warfare <ChevronDown aria-hidden /></a>
        </div>
      </div>
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
      <div className="wx-centre-copy">
        <h2 className="wx-h2"><span>Your training.</span><span>Your progress.</span><span className="wx-o">Your command centre.</span></h2>
        <p className="wx-centre-sub">A complete fitness platform in your pocket.</p>
        <ul className="wx-checks">{CHECKS.map((c) => <li key={c}><Check aria-hidden /> {c}</li>)}</ul>
        <div className="wx-stores">
          {iosUrl && <a href={iosUrl} target="_blank" rel="noopener noreferrer" className="wx-store"><Apple aria-hidden /> <span><small>Download on the</small>App Store</span></a>}
          <GooglePlayBadge href={playUrl} height={58} className="wx-play" />
          <Link href="/download" className="wx-ghost wx-dl"><Zap aria-hidden /> Download app</Link>
        </div>
      </div>
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

const WHO = [
  { title: 'Never trained before', text: 'Beginner programs, easier versions of every move, and a demo video for each one.' },
  { title: 'Training at home', text: 'Tell us what you have: a full gym, a few dumbbells or just the floor. Your plan uses exactly that.' },
  { title: 'Short on time', text: 'You pick how many days a week. The plan fits your week, not the other way round.' },
  { title: 'Tried apps and quit', text: 'Streaks, challenges and a weekly coach check-in that tells you exactly what to do next.' },
];

/** "Is this for someone like me?" answered before the price is asked. */
export function WxWhoFor() {
  return (
    <section className="wx-who" aria-labelledby="wx-who-h">
      <p className="wx-eyebrow">Built for real people</p>
      <h2 id="wx-who-h" className="wx-h3">Start where you are.</h2>
      <ul>
        {WHO.map((w) => (
          <li key={w.title}><Check aria-hidden /><span><b>{w.title}</b><small>{w.text}</small></span></li>
        ))}
      </ul>
      <Link href="/onboarding" className="wx-cta">Find my starting point <ArrowRight aria-hidden /></Link>
    </section>
  );
}

/** Risk removed, right where the price is shown. Only true promises. */
export function WxGuarantee({ trialDays, noCard }: { trialDays: number; noCard: boolean }) {
  if (trialDays <= 0) return null;
  return (
    <ul className="wx-guarantee">
      <li><ShieldCheck aria-hidden /> {trialDays} days free{noCard ? ', no card' : ''}</li>
      <li><Check aria-hidden /> Cancel anytime in your account</li>
      <li><Check aria-hidden /> Switch programs whenever you like</li>
    </ul>
  );
}

export interface WxProgram { id: string; name: string; description: string; level: string; weeks: number; daysPerWeek: number; imageUrl: string | null }

/** The first full sentence, or a clean cut near 120 characters. */
const shortDesc = (d: string) => { const s = d.match(/^.{20,140}?[.!?](\s|$)/)?.[0]?.trim(); return s ?? (d.length > 120 ? d.slice(0, d.lastIndexOf(' ', 120)) + '…' : d); };

const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']] as const;

/** "Choose your training plan": level tabs, one featured real program per level. */
export function WxPlans({ programs, onOpen }: { programs: WxProgram[]; onOpen: (id: string) => void }) {
  const [level, setLevel] = useState<string>('beginner');
  if (!programs.length) return null;
  const inLevel = programs.filter((p) => p.level === level);
  const p = inLevel[0] ?? programs[0];
  return (
    <section id="programs" className="wx-plans" aria-labelledby="wx-plans-h">
      <h2 id="wx-plans-h" className="wx-h3">Choose your<br />training plan</h2>
      <p className="wx-sub2">Flexible plans. Real results.</p>
      <div className="wx-tabs" role="tablist">
        {LEVELS.map(([v, label]) => (
          <button key={v} role="tab" aria-selected={level === v} className={level === v ? 'is-on' : ''} onClick={() => setLevel(v)}>{label}</button>
        ))}
      </div>
      <article className="wx-plan">
        <div className="wx-plan-art">
          <img src={p.imageUrl || '/landing/card-training.webp'} alt="" loading="lazy" />
          <span className="wx-plan-pop"><Flame aria-hidden /> {inLevel.length ? 'Most popular' : 'Featured'}</span>
          <h3>{p.name}</h3>
        </div>
        <p className="wx-plan-desc">{shortDesc(p.description)}</p>
        <ul>
          <li><CalendarCheck aria-hidden /> {p.daysPerWeek} workouts a week · {p.weeks} weeks</li>
          <li><TrendingUp aria-hidden /> Weights go up when you&apos;re ready</li>
          <li><Trophy aria-hidden /> Nutrition targets included</li>
        </ul>
        <Link href={`/onboarding?programId=${p.id}`} className="wx-cta wx-plan-btn">Start plan <ArrowRight aria-hidden /></Link>
      </article>
      <button type="button" className="wx-plan-all" onClick={() => onOpen(p.id)}>Plan details <ChevronRight aria-hidden /></button>
      <Link href="/programs" className="wx-plan-all">View all {programs.length} programs <ChevronRight aria-hidden /></Link>
    </section>
  );
}

const WHY = [
  { Icon: Zap, title: 'Military-grade training plans', sub: 'Every session written out, with the weight to beat.', href: '/programs' },
  { Icon: BarChart3, title: 'Track every rep', sub: 'Workouts, food, water and progress in one place.', href: '#screens' },
  { Icon: Users, title: 'Join a powerful community', sub: 'Challenges, streaks and a PR wall.', href: '/challenges' },
  { Icon: ShieldCheck, title: 'Built for real people', sub: 'No experience needed. Home or gym.', href: '/onboarding' },
];

/** "Why choose Warfare Fitness?" */
export function WxWhy({ ctaLabel }: { ctaLabel: string }) {
  return (
    <section className="wx-why" aria-labelledby="wx-why-h">
      <h2 id="wx-why-h" className="wx-h3">Why choose<br /><span className="wx-o">Warfare Fitness?</span></h2>
      <ul>
        {WHY.map(({ Icon, title, sub, href }) => (
          <li key={title}><Link href={href}><Icon aria-hidden /><span><b>{title}</b><small>{sub}</small></span><ChevronRight aria-hidden className="wx-why-go" /></Link></li>
        ))}
      </ul>
      <div className="wx-why-art"><img src="/landing/why-art.webp" alt="" loading="lazy" /></div>
      <Link href="/onboarding" className="wx-cta wx-why-btn">{ctaLabel} <ArrowRight aria-hidden /></Link>
    </section>
  );
}

/** "Start your 7-day free trial": what you get, the button, the trust row. */
export function WxTrial({ trialDays, ctaLabel, note }: { trialDays: number; ctaLabel: string; note: string }) {
  return (
    <section className="wx-trial" aria-labelledby="wx-trial-h">
      <h2 id="wx-trial-h" className="wx-h3">{trialDays > 0 ? <>Start your<br /><span className="wx-o">{trialDays}-day free trial</span></> : <>Start <span className="wx-o">today</span></>}</h2>
      <p className="wx-sub2">Unlock your full potential.{trialDays > 0 ? ` Free for ${trialDays} days.` : ''}</p>
      <ul className="wx-trial-list">
        <li><Check aria-hidden /> Access all training plans</li>
        <li><Check aria-hidden /> Track your progress</li>
        <li><Check aria-hidden /> Join the community</li>
        <li><Check aria-hidden /> Cancel anytime</li>
      </ul>
      <Link href="/onboarding" className="wx-cta wx-trial-btn">{ctaLabel} <ArrowRight aria-hidden /></Link>
      <p className="wx-trial-note">{note}</p>
      <ul className="wx-trust3">
        <li><ShieldCheck aria-hidden /><span>Secure checkout</span></li>
        <li><Check aria-hidden /><span>{trialDays > 0 ? 'No card for the trial' : 'No lock-in'}</span></li>
        <li><CalendarCheck aria-hidden /><span>Cancel anytime</span></li>
      </ul>
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

