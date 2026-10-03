'use client';

import { useEffect, useRef } from 'react';

/**
 * The burning-logo clip, fetched only when it is actually on screen.
 *
 * The file is 918KB. It was being rendered by three separate components with
 * `src` and `preload="auto"` set in the markup, which meant:
 *
 *  - The landing page downloaded it TWICE, once for the hero and once for
 *    the gated BrandSplash — and the splash is `display: none` for anyone
 *    without a session, so that copy was 918KB fetched to be shown to
 *    nobody. Measured on a throttled phone profile: 1.8MB of media on a
 *    page whose entire job is to load fast.
 *  - It competed with first paint, because a `<video preload="auto">` in
 *    the initial markup starts immediately, ahead of anything deferred.
 *
 * So the element ships with NO src at all. An IntersectionObserver attaches
 * one the first time the element is genuinely visible, which is never for a
 * hidden splash, and the poster — 72KB, already needed — holds the frame
 * until then. Loading is also deferred past the window load event so the
 * clip can never delay the content around it.
 *
 * Decorative in every position it is used, so failing to load is not a
 * failure state: the poster simply stays.
 */
export function BrandVideo({
  className,
  ariaHidden = true,
}: {
  className?: string;
  ariaHidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    let attached = false;
    const attach = () => {
      if (attached || !v.isConnected) return;
      attached = true;
      v.preload = 'auto';
      v.src = '/videos/hero-logo.mp4';
      // play() rejects when autoplay is refused; the poster stays, which is
      // the same thing the user would have seen anyway.
      v.play().catch(() => {});
    };

    // Past first paint. requestIdleCallback where it exists (not Safari),
    // a short timeout otherwise — either way the clip stops competing with
    // the text and images around it.
    const defer = () => {
      const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(attach, { timeout: 2000 });
      else setTimeout(attach, 400);
    };

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      if (document.readyState === 'complete') defer();
      else window.addEventListener('load', defer, { once: true });
    }, { rootMargin: '200px' });
    io.observe(v);

    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      poster="/videos/hero-logo-poster.jpg"
      muted
      loop
      playsInline
      preload="none"
      aria-hidden={ariaHidden || undefined}
    />
  );
}
