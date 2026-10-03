'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandVideo } from './BrandVideo';

/**
 * Full-screen brand hold — the same burning-logo clip the landing page and
 * login screen open with.
 *
 * Used wherever the app has to block on a check that is usually fast but
 * occasionally isn't. A bare "Checking installation…" line spent that moment
 * telling the user about the app's internals; this spends it on the brand
 * instead, and the poster frame paints immediately so there is no flash of
 * empty background before the video is ready.
 *
 * Deliberately no spinner: the clip is short and looping, which reads as
 * "working" on its own. `label` is still rendered for screen readers.
 *
 * `gated`: render hidden, and let CSS reveal it. The landing page keeps this
 * in the HTML permanently and shows it only when <html> carries
 * data-wf-session — set by a pre-paint script for devices with a session —
 * so a returning member sees the logo instead of a flash of the marketing
 * page, while strangers and crawlers get the fully server-rendered landing
 * from the first byte. Visibility decided by CSS, not state, means the
 * server HTML and first client render are identical. See globals.css.
 *
 * The progress line under the logo is driven by real milestones, not a
 * timer that pretends. It is server-rendered at a small starting width so
 * something is on screen before any JavaScript runs; it jumps when the app
 * has hydrated (this component mounted), again when auth has answered, and
 * again when the redirect has been issued. Between milestones it creeps
 * toward — never reaching — the next mark, so it never looks frozen and
 * never claims a completion that has not happened. It only ever reaches the
 * end by the page going away.
 */

// Where the bar sits before hydration (also the SSR width), and the ceiling
// it creeps toward after each real event. None of them is 100: the page
// leaving is the only "done".
const START = 12;
const AFTER_HYDRATE = 45;
const AFTER_AUTH = 80;
const AFTER_REDIRECT = 93;

export function BrandSplash({ label = 'Loading', gated = false }: { label?: string; gated?: boolean }) {
  const { loading, user } = useAuth();
  const [progress, setProgress] = useState(START);

  useEffect(() => {
    // A gated splash that CSS is hiding (a stranger on the landing) has
    // nothing to report and should not tick in the background.
    if (gated && document.documentElement.getAttribute('data-wf-session') !== '1') return;

    const ceiling = !loading && user ? AFTER_REDIRECT : !loading ? AFTER_AUTH : AFTER_HYDRATE;
    // Jump most of the way to the new ceiling on the event itself, then
    // creep toward it: each tick closes 6% of the remaining gap, which is
    // visibly alive for a few seconds and asymptotic after that.
    setProgress((p) => Math.max(p, ceiling - (ceiling - p) * 0.45));
    const id = window.setInterval(() => {
      setProgress((p) => (ceiling - p < 0.2 ? p : p + (ceiling - p) * 0.06));
    }, 120);
    return () => window.clearInterval(id);
  }, [gated, loading, user]);

  return (
    <div
      {...(gated ? { 'data-brand-splash': '' } : {})}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background overflow-hidden"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 45%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 45%, black 30%, transparent 100%)',
          }}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] rounded-full bg-accent/[0.10] blur-3xl" />
      </div>
      <div className="relative w-32 h-32">
        <BrandVideo className="w-full h-full rounded-2xl object-cover shadow-glow-accent" />
      </div>
      {/* Same width as the logo, sitting just under it. The track is faint;
          the fill is the brand accent with a soft glow so it reads on the
          dark ground without shouting. */}
      <div
        className="relative mt-5 w-32 h-[3px] rounded-full bg-white/10 overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full rounded-full bg-accent shadow-[0_0_10px] shadow-accent/70 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="sr-only" role="status">{label}</span>
    </div>
  );
}
