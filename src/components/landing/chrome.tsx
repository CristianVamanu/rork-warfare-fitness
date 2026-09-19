'use client';

/**
 * The landing page's shared surface treatment.
 *
 * The page used to be flat black between sections with one diagonal hazard
 * stripe as its only divider, so every section read as an unrelated block on
 * a void and the whole thing looked like a template with a logo dropped in.
 * These four pieces give it one continuous surface: a backdrop that runs the
 * full length of the page, a divider that reads as an instrument rather than
 * roadworks tape, a consistent section label, and the corner brackets that
 * the standards card established.
 *
 * Everything here is decoration and every piece is aria-hidden and
 * pointer-events-none. None of it is load-bearing for reading the page,
 * which is why it can all be masked, blurred or animated freely.
 */

/**
 * The page-wide surface. Fixed, so it does not scroll away or repeat, and
 * behind everything.
 *
 * Three layers: a grid that fades toward the middle of the viewport so it
 * never fights body text, two slow ember zones that give the page depth
 * without the cost of more WebGL, and a vignette that keeps the edges dark
 * so content holds the centre.
 */
export function LandingBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(ellipse 120% 90% at 50% 50%, transparent 8%, black 65%)',
          WebkitMaskImage: 'radial-gradient(ellipse 120% 90% at 50% 50%, transparent 8%, black 65%)',
        }}
      />
      {/* Ember zones. Deliberately enormous and very low opacity: at this
          size they read as light in the room rather than as two blobs. */}
      <div
        className="absolute -left-1/4 top-[8%] w-[58vw] h-[58vw] rounded-full blur-3xl opacity-[0.14] motion-safe:animate-pulse-glow"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.5), transparent 68%)' }}
      />
      <div
        className="absolute -right-1/4 top-[52%] w-[52vw] h-[52vw] rounded-full blur-3xl opacity-[0.10]"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.45), transparent 68%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 50%, transparent 30%, rgb(0 0 0 / 0.55) 100%)' }}
      />
    </div>
  );
}

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
    <p className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
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
          className={`pointer-events-none absolute ${size} border-transparent group-hover:border-accent/55 transition-colors duration-300 ${pos}`}
        />
      ))}
    </>
  );
}
