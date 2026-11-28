'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowRight, Flame, Dumbbell, RefreshCw, Zap, Shield } from 'lucide-react';
import { funnelHit, landingCampaign } from '@/lib/funnel';

/**
 * Two ad landing pages, tested against the home page:
 *   /start  QuizFirstLanding: the page IS question one of the quiz.
 *   /see    ShowAppLanding:   a silent clip of the app, one button.
 * Each counts in the funnel as "<variant>-<utm_campaign>" (Admin → Funnel).
 */
const LOGO = '/brand/logo-wf.webp';

function useVisit(variant: string) {
  useEffect(() => { funnelHit('visit', landingCampaign(variant)); }, [variant]);
}

function Top() {
  return (
    <header className="lpx-top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="Warfare Fitness" />
      <Link href="/login">Sign in</Link>
    </header>
  );
}

// Same values and order as the quiz's own goal step (onboarding/page.tsx).
const GOALS = [
  { goal: 'lose-fat', label: 'Lose fat', sub: 'Burn fat, keep the muscle', Icon: Flame },
  { goal: 'build-muscle', label: 'Build muscle', sub: 'Add size and shape', Icon: Dumbbell },
  { goal: 'recomposition', label: 'Get lean and toned', sub: 'Lose fat and build muscle together', Icon: RefreshCw },
  { goal: 'strength', label: 'Get stronger', sub: 'Lift more, own the big lifts', Icon: Zap },
  { goal: 'military-prep', label: 'Pass a fitness test', sub: 'Military, police or fire', Icon: Shield },
];

const FACTS = [['14', 'training programs'], ['600+', 'exercise videos'], ['2 min', 'to get your plan']];

function Facts() {
  return (
    <div className="lpx-facts">
      {FACTS.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}
    </div>
  );
}

export function QuizFirstLanding({ note }: { note: string }) {
  useVisit('quiz');
  return (
    <main className="lpx lpx-quiz">
      <Top />
      {/* Desktop only: the athlete beside the choices (hidden on phones by CSS). */}
      <div className="lpx-fig" aria-hidden />
      <div className="lpx-prog" aria-hidden><i /></div>
      <p className="lpx-step">Step 1 · takes about 2 minutes</p>
      <h1 className="lpx-h1">What&apos;s your <span>main goal?</span></h1>
      <p className="lpx-sub">Pick one. We build your training plan and calorie target around it.</p>
      <p className="lpx-pick">Select your goal</p>
      <div className="lpx-goals">
        {GOALS.map(({ goal, label, sub, Icon }) => (
          <Link key={goal} href={`/onboarding?goal=${goal}&next=1`} className="lpx-goal">
            <i aria-hidden><Icon /></i>
            <span><b>{label}</b><small>{sub}</small></span>
            <ChevronRight aria-hidden />
          </Link>
        ))}
      </div>
      <p className="lpx-note">{note}</p>
      <p className="lpx-legal">
        By continuing you agree to our <Link href="/terms">Terms</Link> and acknowledge our <Link href="/privacy">Privacy Policy</Link>.
        This site does not provide medical advice. Check with a healthcare professional about any health concerns before starting.
      </p>
      <Facts />
    </main>
  );
}

const SHOTS = [
  { img: '/landing/app-training.webp', title: 'A plan, day by day', text: 'Matched to your goal and the equipment you have.' },
  { img: '/landing/app-set.webp', title: 'Every set tracked', text: 'Weight, reps, a rest timer and a demo video for each move.' },
  { img: '/landing/app-nutrition.webp', title: 'Food and water', text: 'Scan a meal with the camera and hit your daily targets.' },
];

export function ShowAppLanding({ note }: { note: string }) {
  useVisit('see');
  const cta = useRef<HTMLAnchorElement>(null);
  const [pinned, setPinned] = useState(false);
  // Once the main button scrolls away, a slim bar with the same button stays at the top.
  useEffect(() => {
    const el = cta.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <main className="lpx lpx-see">
      <div className="lpx-pin" data-on={pinned ? '1' : '0'} aria-hidden={!pinned}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="" />
        <Link href="/onboarding" tabIndex={pinned ? 0 : -1}>Build my plan</Link>
      </div>
      <Top />
      <h1 className="lpx-h1 lpx-center">See the app. <span>Then decide.</span></h1>
      {/* Desktop only (hidden on phones by CSS): the headline has room for a line of context. */}
      <p className="lpx-sub lpx-see-sub">Your training plan, every set tracked, food and water, all in one place. Watch it, then build yours in 2 minutes.</p>
      <div className="lpx-video">
        <video src="/videos/lp-clip.mp4" poster="/videos/lp-clip-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="The Warfare Fitness app: dashboard, training plan, workout, nutrition and quests" />
      </div>
      <Link ref={cta} href="/onboarding" className="lpx-cta lpx-cta-main">Build my plan <ArrowRight aria-hidden /></Link>
      <p className="lpx-note lpx-note-main">{note}</p>
      <div className="lpx-shots">
        {SHOTS.map((s, i) => (
          <div key={s.title} className="lpx-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.img} alt="" loading="lazy" />
            <div><em>0{i + 1}</em><b>{s.title}</b><p>{s.text}</p></div>
          </div>
        ))}
      </div>
      <Facts />
      <div className="lpx-final">
        <Link href="/onboarding" className="lpx-cta">Build my plan <ArrowRight aria-hidden /></Link>
        <p className="lpx-note">{note}</p>
      </div>
    </main>
  );
}
