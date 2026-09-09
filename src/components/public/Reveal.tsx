'use client';

/**
 * Fade-and-rise on scroll for the public pages.
 *
 * Deliberately NOT framer-motion. These pages exist to rank, and adding ~37KB
 * gzipped of animation library to get a fade-in would cost more in load time
 * than the effect is worth — the same reasoning that kept three.js out of the
 * WebGL backdrop. This is an IntersectionObserver and a CSS transition: about
 * a kilobyte, and indistinguishable on screen.
 *
 * The content renders visible-by-default in the markup and is only hidden once
 * the observer attaches, so anyone with JavaScript disabled — and every
 * crawler that does not run it — sees the full page rather than a blank one.
 * A reveal animation that can hide content from search would defeat the point
 * of these pages entirely.
 */

import { useEffect, useRef, useState } from 'react';

export function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect the OS setting: show it, skip the movement entirely.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    // No IntersectionObserver (very old browser) — just show everything.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    setArmed(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect(); // once only — re-animating on scroll-back reads as broken
        }
      },
      { rootMargin: '-60px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        armed
          ? {
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(24px)',
              // Capped: staggering a long list by index means the last card
              // waits seconds, which reads as a slow page, not an effect.
              transition: `opacity .5s cubic-bezier(.16,1,.3,1) ${Math.min(delay, 0.3)}s, transform .5s cubic-bezier(.16,1,.3,1) ${Math.min(delay, 0.3)}s`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
