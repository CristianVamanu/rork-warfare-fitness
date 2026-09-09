import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';

/**
 * The public programme index — one of the few pages on this app a search
 * engine can actually read. Everything past login is disallowed in robots.ts,
 * which left eight indexable URLs, all of them login/legal/marketing. The
 * programmes are the only real content here, and they were entirely invisible.
 *
 * Revalidated rather than dynamic: the catalogue changes when an admin edits
 * it, not per request, and a cached page is the difference between a crawler
 * seeing a fast page and a slow one.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const programs = await getPublicPrograms();
  return {
    title: 'Training Programs — Warfare Fitness',
    description:
      `${programs.length} structured training programs: military-inspired selection prep, strength, ` +
      `hypertrophy and fat loss. Full week-by-week plans with sets, reps and progression.`,
    alternates: { canonical: '/programs' },
  };
}

const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength', hypertrophy: 'Muscle Building', endurance: 'Endurance',
  'weight-loss': 'Fat Loss', general: 'General Fitness',
};

export default async function ProgramsIndexPage() {
  const programs = await getPublicPrograms();

  return (
    <div className="min-h-screen bg-background">
      <PublicNav programs={programs.map((p) => ({ name: p.name, slug: p.slug }))} />

      <main className="max-w-5xl mx-auto px-5 pb-20">
        <header className="py-10 sm:py-14 max-w-2xl">
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Training Programs
          </h1>
          <p className="text-text-secondary mt-4 text-base sm:text-lg leading-relaxed">
            Every program below is a complete, week-by-week plan — not a list of exercises.
            Sets, reps, rest and progression are prescribed for each session, and the app
            tracks where you are so you never have to remember what week you&apos;re on.
          </p>
        </header>

        {programs.length === 0 ? (
          <p className="text-text-secondary">No programs published yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/programs/${p.slug}`}
                className="group block rounded-2xl border border-white/8 bg-surface p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-accent bg-accent-muted rounded-full px-2.5 py-1">
                    {GOAL_LABEL[p.goal] ?? p.goal}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary border border-white/10 rounded-full px-2.5 py-1">
                    {p.level}
                  </span>
                </div>
                <h2 className="text-lg font-black text-white group-hover:text-accent transition-colors">
                  {p.name}
                </h2>
                <p className="text-sm text-text-secondary mt-2 line-clamp-3 leading-relaxed">
                  {p.description}
                </p>
                <p className="text-xs text-text-tertiary mt-3">
                  {p.weeks} weeks · {p.daysPerWeek}×/week · {p.weeks * p.daysPerWeek} sessions
                </p>
              </Link>
            ))}
          </div>
        )}

        <section className="mt-14 rounded-2xl border border-accent/25 bg-surface p-6 sm:p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-black text-white">Pick one and start this week</h2>
          <p className="text-text-secondary mt-2 max-w-xl mx-auto text-sm sm:text-base">
            Every program comes with the tracking, nutrition targets and community.
            Start free — you can cancel before you&apos;re charged.
          </p>
          <Link
            href="/onboarding"
            className="inline-block mt-5 bg-accent text-black font-bold rounded-xl px-6 py-3 hover:opacity-90 transition-opacity"
          >
            Start Free
          </Link>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
