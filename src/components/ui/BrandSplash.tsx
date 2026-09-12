'use client';

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
 */
export function BrandSplash({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden">
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
        <video
          className="w-full h-full rounded-2xl object-cover shadow-glow-accent"
          src="/videos/hero-logo.mp4"
          poster="/videos/hero-logo-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
      </div>
      <span className="sr-only" role="status">{label}</span>
    </div>
  );
}
