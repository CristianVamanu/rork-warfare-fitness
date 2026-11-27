'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Guided tour of the home screen. Runs once per device the first time a
 * member lands on the dashboard, and again whenever they pick "Take the tour"
 * in Profile (startAppTour). Each step spotlights one real element on the
 * page, found by its data-tour attribute, and explains it in a sentence. A
 * step whose element is not on screen (desktop layout, hidden card) is skipped.
 */
const DONE_KEY = 'wf:tour-done:v1';
const START_KEY = 'wf:tour-start';
const START_EVENT = 'wf:tour-start';

interface Step { target?: string; title: string; body: string }
const STEPS: Step[] = [
  { title: 'Welcome to Warfare Fitness', body: 'A 30-second look at where everything lives. You can skip at any time and retake it from Profile.' },
  { target: '[data-tour="week"]', title: 'Your week', body: 'Your streak and how many sessions you have done this week. Start Workout opens today’s session.' },
  { target: '[data-tour="today"]', title: 'Today’s numbers', body: 'Calories, sessions this week, total workouts and protein, updated as you log.' },
  { target: '[data-tour="tiles"]', title: 'Fuel and recovery', body: 'Jump straight to Nutrition, Hydration and Recovery.' },
  { target: '[data-tour="quick"]', title: 'Quick log', body: 'Today’s challenge on the left. Add protein and water on the right without leaving home.' },
  { target: '[data-tour="nav-training"]', title: 'Training', body: 'Your programme, the exercise library and every way to start a workout.' },
  { target: '[data-tour="nav-progress"]', title: 'Progress', body: 'Your stats, personal records and body measurements over time.' },
  { target: '[data-tour="nav-community"]', title: 'Community', body: 'Challenges, leaderboards and chat with other members.' },
  { target: '[data-tour="nav-profile"]', title: 'Profile', body: 'Your level, achievements, quests, support and light or dark mode. The tour lives here too.' },
  { title: 'You’re set', body: 'Start today’s workout whenever you’re ready.' },
];

/** Profile's "Take the tour": go home and start from the first step. */
export function startAppTour(router: { push: (href: string) => void }, pathname: string) {
  try { sessionStorage.setItem(START_KEY, '1'); } catch { /* private mode */ }
  if (pathname === '/dashboard') window.dispatchEvent(new Event(START_EVENT));
  else router.push('/dashboard');
}

const visibleEl = (sel?: string): HTMLElement | null => {
  if (!sel) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) return el;
  }
  return null;
};

export function AppTour({ ready }: { ready: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(190);

  const finish = useCallback(() => {
    setIndex(null);
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ }
  }, []);

  // Start: first visit on this device, or an explicit request from Profile.
  useEffect(() => {
    if (!ready || pathname !== '/dashboard' || index !== null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const requested = () => { try { return sessionStorage.getItem(START_KEY) === '1'; } catch { return false; } };
    const done = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; } };
    const tryStart = () => {
      if (cancelled) return;
      if (!requested() && done()) return;
      // Never open over another dialog (welcome video, rating prompt, paywall),
      // and wait until the home cards have actually rendered.
      if (document.querySelector('[role="dialog"]') || !visibleEl('[data-tour="week"]')) { timer = setTimeout(tryStart, 1200); return; }
      try { sessionStorage.removeItem(START_KEY); } catch { /* ignore */ }
      window.scrollTo({ top: 0 });
      setIndex(0);
    };
    timer = setTimeout(tryStart, 900);
    const onEvent = () => { clearTimeout(timer); timer = setTimeout(tryStart, 50); };
    window.addEventListener(START_EVENT, onEvent);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener(START_EVENT, onEvent); };
  }, [ready, pathname, index]);

  // Leaving the dashboard mid-tour ends it quietly (it can be retaken).
  useEffect(() => { if (index !== null && pathname !== '/dashboard') finish(); }, [pathname, index, finish]);

  const go = useCallback((from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (i >= 0 && i < STEPS.length && STEPS[i].target && !visibleEl(STEPS[i].target)) i += dir;
    if (i >= STEPS.length) finish(); else if (i >= 0) setIndex(i);
  }, [finish]);

  // Measure the current target, keeping it in view and tracking scroll/resize.
  useLayoutEffect(() => {
    if (index === null) return;
    const el = visibleEl(STEPS[index].target);
    if (!el) { setRect(null); return; }
    if (getComputedStyle(el).position !== 'fixed' && !el.closest('nav')) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const measure = () => { const r = el.getBoundingClientRect(); setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); };
    measure();
    const t = setTimeout(measure, 250);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [index]);

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); }, [index, rect]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(index, 1); }
      else if (e.key === 'ArrowLeft') go(index, -1);
    };
    window.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, finish]);

  if (index === null) return null;
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const PAD = 6;
  // Card goes under the target when there is room, otherwise above it.
  let cardTop: number | undefined;
  if (rect) {
    const below = rect.y + rect.h + PAD + 14;
    cardTop = below + cardH + 12 <= vh ? below : Math.max(12, rect.y - PAD - 14 - cardH);
  }

  return (
    <div className="wf-tour" role="dialog" aria-modal="true" aria-label="App tour">
      {rect
        ? <div className="wf-tour-spot" style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }} />
        : <div className="wf-tour-dim" />}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="wf-tour-card"
        style={rect ? { top: cardTop } : { top: '50%', transform: 'translateY(-50%)' }}
      >
        <p className="wf-tour-count">{index + 1} / {STEPS.length}</p>
        <h2>{step.title}</h2>
        <p className="wf-tour-body">{step.body}</p>
        <div className="wf-tour-bar" aria-hidden><i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="wf-tour-actions">
          {!last && <button type="button" className="wf-tour-skip" onClick={finish}>Skip</button>}
          <span style={{ flex: 1 }} />
          {index > 0 && <button type="button" className="wf-tour-back" onClick={() => go(index, -1)}>Back</button>}
          <button type="button" className="wf-tour-next" onClick={() => { if (last) { finish(); router.push('/training'); } else go(index, 1); }}>
            {last ? 'Go to Training' : index === 0 ? 'Show me' : 'Next'}
          </button>
        </div>
        {last && <button type="button" className="wf-tour-skip wf-tour-close" onClick={finish}>Stay on Home</button>}
      </div>
    </div>
  );
}
