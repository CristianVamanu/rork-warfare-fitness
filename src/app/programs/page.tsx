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
  endurance: { label: 'Endurance & Selection', blurb: 'Long efforts, rucks, work capacity. The blocks built on selection-style training.' },
  strength: { label: 'Strength', blurb: 'Heavier loads, lower reps, real progression on the main lifts.' },
  hypertrophy: { label: 'Muscle Building', blurb: 'Volume and tension, organised into blocks that keep growing.' },
  'weight-loss': { label: 'Fat Loss', blurb: 'Conditioning and deficit work that keeps the strength you already have.' },
  general: { label: 'General Fitness', blurb: 'Broad, hard, and hard to be bad at. Good all-round base building.' },
};

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

          <header className="max-w-5xl mx-auto px-5 pt-12 pb-16 sm:pt-20 sm:pb-24">
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
                Every program here is a complete campaign — not a list of exercises. Sets, reps,
                tempo and rest are prescribed for every session, progression is built into the
                weeks, and the app remembers exactly where you are.
              </p>

              <div className="flex flex-wrap gap-x-10 gap-y-4 mt-9">
                {[
                  { v: programs.length, l: 'Programs' },
                  { v: totalWeeks, l: 'Weeks of training' },
                  { v: totalSessions.toLocaleString(), l: 'Sessions written' },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="text-3xl sm:text-4xl font-black text-white tabular-nums">{s.v}</p>
                    <p className="text-[11px] uppercase tracking-wider text-text-tertiary mt-1">{s.l}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </header>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 pb-24">
        {programs.length === 0 ? (
          <p className="text-text-secondary">No programs published yet.</p>
        ) : (
          <>
            {grouped.map((group) => (
              <section key={group.goal} className="mb-16">
                <Reveal>
                  <div className="flex items-end justify-between gap-4 border-b border-white/8 pb-4 mb-6">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        {group.meta.label}
                      </h2>
                      <p className="text-sm text-text-secondary mt-1.5 max-w-xl">{group.meta.blurb}</p>
                    </div>
                    <span className="text-xs text-text-tertiary whitespace-nowrap pb-1">
                      {group.items.length} program{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Reveal>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.05}>
                      <ProgramCard p={p} />
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
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {other.map((p, i) => (
                    <Reveal key={p.id} delay={i * 0.05}>
                      <ProgramCard p={p} />
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
                ['Day-by-day prescription', 'Every session written out — no guessing what to do or how hard.'],
                ['Automatic progression', 'Volume and intensity move week to week. You just follow it.'],
                ['Tracking that remembers', 'Where you are, what you lifted last time, what comes next.'],
                ['Nutrition targets', 'Calories and macros calculated for your body and this goal.'],
                ['Exercise substitutions', 'Short on equipment? Swap a movement without breaking the plan.'],
                ['The community', 'Channels and a PR wall full of people running the same programs.'],
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
                Pick one. Start this week.
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
