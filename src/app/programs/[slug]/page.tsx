import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicPrograms, getPublicProgramBySlug } from '@/lib/publicPrograms';
import { buildProgramMarketing } from '@/lib/programMarketing';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';

export const revalidate = 3600;

/**
 * One indexable page per program.
 *
 * Every number and every workout on this page is computed from the program
 * document itself (see programMarketing.ts), so editing a program in the admin
 * panel updates its marketing page in the same act, and the page can never
 * advertise a twelve-week plan that is actually eight.
 */

export async function generateStaticParams() {
  // Pre-renders what exists at build time; anything published later is still
  // served, just rendered on first request and then cached.
  try {
    const programs = await getPublicPrograms();
    return programs.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const program = await getPublicProgramBySlug(slug);
  if (!program) return { title: 'Program not found' };
  const m = buildProgramMarketing(program);
  return {
    title: m.seoTitle,
    description: m.seoDescription,
    alternates: { canonical: `/programs/${slug}` },
    openGraph: {
      title: m.seoTitle,
      description: m.seoDescription,
      type: 'article',
      ...(program.imageUrl ? { images: [{ url: program.imageUrl }] } : {}),
    },
  };
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = await getPublicProgramBySlug(slug);
  if (!program) notFound();

  const m = buildProgramMarketing(program);
  const all = await getPublicPrograms();
  const related = all.filter((p) => p.slug !== slug && p.goal === program.goal).slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav programs={all.map((p) => ({ name: p.name, slug: p.slug }))} />

      <main className="max-w-3xl mx-auto px-5 pb-20">
        {/* Hero */}
        <header className="py-10 sm:py-14">
          <Link href="/programs" className="text-xs text-text-tertiary hover:text-white transition-colors">
            ← All programs
          </Link>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-4">
            {m.headline}
          </h1>
          <p className="text-base sm:text-lg text-text-secondary mt-4 leading-relaxed">
            {m.subheadline}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
            {m.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/8 bg-surface p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{s.label}</p>
                <p className="text-lg font-black text-white mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          <Link
            href="/onboarding"
            className="inline-block mt-7 bg-accent text-black font-bold rounded-xl px-6 py-3 hover:opacity-90 transition-opacity"
          >
            Start this program free
          </Link>
        </header>

        {/* What it is */}
        <section className="py-8 border-t border-white/8">
          <h2 className="text-xl sm:text-2xl font-black text-white">What this program is</h2>
          <p className="text-text-secondary mt-3 leading-relaxed whitespace-pre-line">{m.whoFor}</p>
          <p className="text-sm text-text-tertiary mt-4 border-l-2 border-accent/40 pl-4">
            {m.requirement}
          </p>
        </section>

        {/* Structure */}
        {m.phases.length > 0 && (
          <section className="py-8 border-t border-white/8">
            <h2 className="text-xl sm:text-2xl font-black text-white">How it&apos;s structured</h2>
            <p className="text-text-secondary mt-2 text-sm">
              {m.phases.length} phases across {program.weeks} weeks. Each one builds on the last —
              volume, intensity and complexity all move.
            </p>
            <div className="mt-5 space-y-3">
              {m.phases.map((ph, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-surface p-4">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="font-bold text-white">{ph.label}</p>
                    <p className="text-xs text-accent font-medium">{ph.weeks}</p>
                  </div>
                  {ph.focus && <p className="text-xs text-text-tertiary mt-1.5">{ph.focus}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The training week */}
        {m.weekPattern.length > 0 && (
          <section className="py-8 border-t border-white/8">
            <h2 className="text-xl sm:text-2xl font-black text-white">A week in this program</h2>
            <div className="mt-5 grid gap-2">
              {m.weekPattern.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                    d.isRest ? 'border-white/5 bg-transparent' : 'border-white/8 bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-text-tertiary w-12">DAY {i + 1}</span>
                    <span className={d.isRest ? 'text-sm text-text-tertiary' : 'text-sm font-semibold text-white'}>
                      {d.label}
                    </span>
                  </div>
                  {!d.isRest && (
                    <span className="text-xs text-text-tertiary">{d.exerciseCount} exercises</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Real sessions */}
        {m.sampleSessions.some((s) => s.exercises.length > 0) && (
          <section className="py-8 border-t border-white/8">
            <h2 className="text-xl sm:text-2xl font-black text-white">Sample sessions</h2>
            <p className="text-text-secondary mt-2 text-sm">
              Straight out of the program — this is exactly what you&apos;d see on the day.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {m.sampleSessions.filter((s) => s.exercises.length > 0).map((s, i) => (
                <div key={i} className="rounded-2xl border border-white/8 bg-surface p-5">
                  <p className="font-black text-white">{s.label}</p>
                  <ul className="mt-3 space-y-2.5">
                    {s.exercises.map((e, j) => (
                      <li key={j} className="flex justify-between gap-3 text-sm">
                        <span className="text-text-secondary">{e.name}</span>
                        <span className="text-text-tertiary whitespace-nowrap text-xs mt-0.5">{e.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Included */}
        <section className="py-8 border-t border-white/8">
          <h2 className="text-xl sm:text-2xl font-black text-white">What you get</h2>
          <ul className="mt-4 space-y-2.5">
            {m.includes.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-text-secondary">
                <span className="text-accent font-bold shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="mt-6 rounded-2xl border border-accent/25 bg-surface p-6 sm:p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-black text-white">
            {m.totalSessions} sessions. Start the first one today.
          </h2>
          <p className="text-text-secondary mt-2 text-sm sm:text-base max-w-lg mx-auto">
            Free to start. You won&apos;t be charged until the trial is up, and you can cancel before then.
          </p>
          <Link
            href="/onboarding"
            className="inline-block mt-5 bg-accent text-black font-bold rounded-xl px-6 py-3 hover:opacity-90 transition-opacity"
          >
            Start {m.headline} free
          </Link>
        </section>

        {related.length > 0 && (
          <section className="py-10">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-tertiary">
              Similar programs
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/programs/${r.slug}`}
                  className="rounded-xl border border-white/8 bg-surface p-4 hover:border-accent/30 transition-colors"
                >
                  <p className="text-sm font-bold text-white">{r.name}</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {r.weeks} weeks · {r.daysPerWeek}×/week
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
