'use client';

/**
 * Small, static landing-page trim.
 *
 * Deliberately cheap. An earlier version of this file also carried a
 * full-page animated backdrop — a fixed 58vw element with blur-3xl and a
 * pulse animation — which on a phone is a continuous full-screen repaint
 * and was a real part of why the site started to stutter. Everything that
 * survives here paints once and then costs nothing: no animation, no
 * filters, no compositing layers.
 */

/**
 * Between sections.
 *
 * Replaces the diagonal hazard stripe, which was the single most dated
 * element on the page — roadworks tape reads as 2014 startup, not as
 * something precise. A hairline with tick marks reads as a measuring edge,
 * which is what this product actually is.
 */
export function DataDivider() {
  return (
    <div aria-hidden className="relative max-w-5xl mx-auto px-5 py-2">
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent-rgb) / 0.35) 20%, rgb(var(--accent-rgb) / 0.35) 80%, transparent)' }}
      />
      <div className="absolute inset-x-5 -top-1 flex justify-between">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="w-px h-2"
            style={{ background: `rgb(var(--accent-rgb) / ${i % 3 === 0 ? 0.42 : 0.18})` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The label above a section heading.
 *
 * Every section used to open with a bare h2 floating in space. One
 * consistent eyebrow — a live dot and a tracked-out label — is what makes a
 * long page read as one instrument with several panels.
 */
export function SectionEyebrow({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  return (
    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
      <span className="relative flex w-1.5 h-1.5">
        {live && <span className="absolute inline-flex w-full h-full rounded-full bg-accent opacity-60 animate-ping motion-reduce:hidden" />}
        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent" />
      </span>
      {children}
    </p>
  );
}

/**
 * The four targeting brackets, as established by the standards card.
 *
 * `group-hover` in the class means the PARENT must carry `group`. Pulled out
 * of that card so every panel on the page can wear the same corners instead
 * of each one reinventing them slightly differently.
 */
export function CornerBrackets({ size = 'w-4 h-4' }: { size?: string }) {
  // Class names are written out in full on purpose. Tailwind scans source
  // text, so an interpolated `left-${n}` compiles to nothing and the
  // brackets silently never appear.
  return (
    <>
      {[
        'left-3 top-3 border-l-2 border-t-2',
        'right-3 top-3 border-r-2 border-t-2',
        'left-3 bottom-3 border-l-2 border-b-2',
        'right-3 bottom-3 border-r-2 border-b-2',
      ].map((pos) => (
        <span
          key={pos}
          aria-hidden
          // Visible at rest, not only on hover. Hover-only brackets meant
          // that on a phone — which is most of this traffic — they never
          // appeared at all, so the panels lost the one detail that makes
          // them read as instrument panels rather than plain cards.
          className={`pointer-events-none absolute ${size} border-accent/25 group-hover:border-accent/60 transition-colors duration-300 ${pos}`}
        />
      ))}
    </>
  );
}
