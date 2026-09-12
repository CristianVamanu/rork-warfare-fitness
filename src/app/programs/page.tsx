import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding, getPublicTrialTerms } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { Reveal } from '@/components/public/Reveal';
import { ProgramCard } from '@/components/public/ProgramCard';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [programs, brand] = await Promise.all([getPublicPrograms(), getPublicBranding()]);
  return {
    title: `Training Programs — ${brand.appName}`,
    description:
      `${programs.length} structured training programs: military-inspired selection prep, strength, ` +
      `hypertrophy and fat loss. Full week-by-week plans with sets, reps and progression.`,
    alternates: { canonical: '/programs' },
  };
}

/** Presentation order — the military-inspired blocks lead, because that is
 *  what the brand is known for and what people arrive searching for. */
const GOAL_ORDER = ['endurance', 'strength', 'hypertrophy', 'weight-loss', 'general'] as const;
const GOAL_META: Record<string, { label: string; blurb: string }> = {
  endurance: {
    label: 'Endurance & Selection',
    blurb: 'Built from the standards selection actually tests. Arrive able to pass, not hoping to.',
  },
  strength: {
    label: 'Strength',
    blurb: 'Heavier bar, lower reps, and the next jump decided before you walk in.',
  },
  hypertrophy: {
    label: 'Muscle Building',
    blurb: 'Enough volume to grow, spaced so you can recover and do it again.',
  },
  'weight-loss': {
    label: 'Fat Loss',
    blurb: 'A deficit that protects the muscle you already paid for. Lighter and stronger.',
  },
  general: {
    label: 'General Fitness',
    blurb: 'Hard to be bad at anything. The base that makes everything else easier.',
  },
};

/**
 * Column count per goal group, chosen so the items FILL the rows they are
 * given. A single grid for every section is what made this page look broken
 * on desktop: groups hold one, two or three programs, and a fixed
 * three-column grid left a one-program section as a narrow card with two
 * thirds of the row empty, and a four-program one as a row of three plus an
 * orphan.
 *
 * One or two programs render as wide horizontal cards across the full
 * measure; four render 2×2 rather than 3+1; three or more otherwise take the
 * three-column grid, which they fill.
 */
function groupLayout(count: number): { cols: string; wide: boolean } {
  if (count === 1) return { cols: 'grid-cols-1', wide: true };
  if (count === 2) return { cols: 'grid-cols-1 lg:grid-cols-2', wide: true };
  if (count === 4) return { cols: 'grid-cols-1 sm:grid-cols-2', wide: false };
  return { cols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', wide: false };
}

export default async function ProgramsIndexPage() {
  const [programs, brand, terms] = await Promise.all([
    getPublicPrograms(),
    getPublicBranding(),
    getPublicTrialTerms(),
  ]);
  const navPrograms = programs.map((p) => ({ name: p.name, slug: p.slug }));

  const totalSessions = programs.reduce((n, p) => n + p.weeks * p.daysPerWeek, 0);
  const totalWeeks = programs.reduce((n, p) => n + p.weeks, 0);

  const grouped = GOAL_ORDER
    .map((goal) => ({ goal, meta: GOAL_META[goal], items: programs.filter((p) => p.goal === goal) }))
    .filter((g) => g.items.length > 0);
  // Anything with a goal outside the known set still has to appear — a silent
  // drop here would hide a program an admin had published.
  const known = new Set(GOAL_ORDER as readonly string[]);
  const other = programs.filter((p) => !known.has(p.goal));

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <TacticalBackdrop className="h-[520px]" />
        <div className="relative z-10">
          <PublicNav programs={navPrograms} logoUrl={brand.logoUrl} appName={brand.appName} />

          <header className="max-w-6xl mx-auto px-5 pt-12 pb-16 sm:pt-20 sm:pb-24">
            <Reveal>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-px bg-accent" />
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                  The Program Library
                </p>
              </div>
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight mt-5 leading-[0.95]">
                Pick your fight.
              </h1>
              <p className="text-text-secondary mt-6 text-base sm:text-lg leading-relaxed max-w-2xl">
                Not a list of exercises. A campaign. Every session is written out before
                you start, so the only thing left to decide is whether you show up.
              </p>

              <div className="grid grid-cols-3 gap-4 mt-9 max-w-lg">
                {[
                  { v: programs.length, l: 'Programs' },
                  { v: totalWeeks, l: 'Weeks of training' },
                  { v: totalSessions.toLocaleString(), l: 'Sessions written' },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="text-2xl sm:text-4xl font-black text-white tabular-nums">{s.v}</p>
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-text-tertiary mt-1 leading-tight">{s.l}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </header>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-5 pb-24">
        {programs.length === 0 ? (
          <p className="text-text-secondary">No programs published yet.</p>
        ) : (
          <>
            {grouped.map((group) => (
              <section key={group.goal} className="mb-16">
                {/* Not wrapped in Reveal: a section heading that depends on
                    an observer firing can render as an empty band, which is
                    exactly what it did on iOS. The cards below still fade. */}
                <div>
                  <div className="border-b border-white/8 pb-4 mb-6">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        {group.meta.label}
                      </h2>
                      <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
                        {group.items.length} program{group.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary mt-2 max-w-xl">{group.meta.blurb}</p>
                  </div>
                </div>
                <div className={`grid gap-5 ${groupLayout(group.items.length).cols}`}>
                  {group.items.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.05}>
                      <ProgramCard p={p} wide={groupLayout(group.items.length).wide} />
                    </Reveal>
                  ))}
                </div>
              </section>
            ))}

            {other.length > 0 && (
              <section className="mb-16">
                <h2 className="text-2xl font-black text-white border-b border-white/8 pb-4 mb-6">
                  More Programs
                </h2>
                <div className={`grid gap-5 ${groupLayout(other.length).cols}`}>
                  {other.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.05}>
                      <ProgramCard p={p} wide={groupLayout(other.length).wide} />
                    </Reveal>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* What every program includes — the same for all of them, so it
            belongs here once rather than repeated on eleven pages. */}
        <Reveal>
          <section className="rounded-3xl border border-white/8 bg-surface p-8 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Every program comes with
            </h2>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 mt-7">
              {[
                ['Every session written out', 'Sets, reps, tempo and rest. Nothing to decide at six in the morning.'],
                ['The next jump already decided', 'The weeks get harder on a schedule, so you stop negotiating with yourself.'],
                ['It remembers so you do not have to', 'Where you are, what you lifted last time, what is next. Close it mid-set and nothing is lost.'],
                ['Numbers for your body', 'Calories and protein worked out from your height, weight, age and this goal.'],
                ['Swap any movement', 'No rack, no bench, hotel gym. Substitute the lift and the plan still holds.'],
                ['People on the same program', 'Channels and a PR wall. It is much harder to quietly stop in front of witnesses.'],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <div>
                    <p className="font-bold text-white text-sm">{title}</p>
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="mt-8 relative rounded-3xl border border-accent/30 overflow-hidden p-10 sm:p-14 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,166,35,0.16),transparent_60%)]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Pick one. Start today.
              </h2>
              <p className="text-text-secondary mt-4 max-w-lg mx-auto">
                {terms.disclosure}
              </p>
              <Link
                href="/onboarding"
                className="inline-block mt-8 bg-accent text-black font-bold rounded-xl px-9 py-4 hover:opacity-90 transition-opacity"
              >
                {terms.ctaLabel}
              </Link>
            </div>
          </section>
        </Reveal>
      </main>

      <PublicFooter appName={brand.appName} />
    </div>
  );
}
