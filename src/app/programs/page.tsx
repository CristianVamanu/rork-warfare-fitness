import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { Reveal } from '@/components/public/Reveal';

/**
 * The public programme index — one of the few pages on this app a search
 * engine can actually read. Everything past login is kept out of the index,
 * which left eight indexable URLs, all of them login/legal/marketing. The
 * programmes are the only real content here, and they were entirely invisible.
 *
 * Revalidated rather than dynamic: the catalogue changes when an admin edits
 * it, not per request, and a cached page is the difference between a crawler
 * seeing a fast page and a slow one.
 */
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

const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength', hypertrophy: 'Muscle Building', endurance: 'Endurance',
  'weight-loss': 'Fat Loss', general: 'General Fitness',
};

export default async function ProgramsIndexPage() {
  const [programs, brand] = await Promise.all([getPublicPrograms(), getPublicBranding()]);
  const navPrograms = programs.map((p) => ({ name: p.name, slug: p.slug }));

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <TacticalBackdrop className="h-[460px]" />
        <div className="relative z-10">
          <PublicNav programs={navPrograms} logoUrl={brand.logoUrl} appName={brand.appName} />

          <header className="max-w-5xl mx-auto px-5 pt-10 pb-14 sm:pt-16 sm:pb-20">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                {programs.length} Programs · Every Level
              </p>
              <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight mt-4 max-w-3xl leading-[1.05]">
                Pick your fight.
              </h1>
              <p className="text-text-secondary mt-5 text-base sm:text-lg leading-relaxed max-w-2xl">
                Every program below is a complete, week-by-week plan — not a list of exercises.
                Sets, reps, rest and progression are prescribed for each session, and the app
                tracks where you are so you never have to remember what week you&apos;re on.
              </p>
            </Reveal>
          </header>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 pb-20">
        {programs.length === 0 ? (
          <p className="text-text-secondary">No programs published yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {programs.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.05}>
                <Link
                  href={`/programs/${p.slug}`}
                  className="group relative block h-full rounded-2xl border border-white/8 bg-surface overflow-hidden hover:border-accent/40 transition-colors"
                >
                  {/* The cover art an admin already uploaded. It was on the
                      landing page and in the app, and missing from the pages
                      built to sell these programs to strangers. */}
                  <div className="relative aspect-[16/9] bg-black/40 overflow-hidden">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-accent/15 via-transparent to-transparent flex items-center justify-center">
                        <span className="text-5xl font-black text-white/10">{p.name[0]}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex flex-wrap gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-black bg-accent rounded-full px-2.5 py-1">
                        {GOAL_LABEL[p.goal] ?? p.goal}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-white bg-black/60 backdrop-blur rounded-full px-2.5 py-1">
                        {p.level}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h2 className="text-lg font-black text-white group-hover:text-accent transition-colors">
                      {p.name}
                    </h2>
                    <p className="text-sm text-text-secondary mt-2 line-clamp-3 leading-relaxed">
                      {p.description}
                    </p>
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/8 text-xs text-text-tertiary">
                      <span>{p.weeks} weeks</span>
                      <span>{p.daysPerWeek}×/week</span>
                      <span className="text-accent font-semibold">{p.weeks * p.daysPerWeek} sessions</span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal>
          <section className="mt-16 relative rounded-3xl border border-accent/25 bg-surface overflow-hidden p-8 sm:p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-black text-white">Pick one. Start this week.</h2>
              <p className="text-text-secondary mt-3 max-w-xl mx-auto text-sm sm:text-base">
                Every program comes with the tracking, nutrition targets and community.
                Start free — you can cancel before you&apos;re charged.
              </p>
              <Link
                href="/onboarding"
                className="inline-block mt-6 bg-accent text-black font-bold rounded-xl px-8 py-3.5 hover:opacity-90 transition-opacity"
              >
                Start Free
              </Link>
            </div>
          </section>
        </Reveal>
      </main>

      <PublicFooter appName={brand.appName} />
    </div>
  );
}
