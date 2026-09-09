import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Dumbbell, Check } from 'lucide-react';
import { getPublicPrograms, getPublicProgramBySlug } from '@/lib/publicPrograms';
import { buildProgramMarketing } from '@/lib/programMarketing';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { Reveal } from '@/components/public/Reveal';
import { ProgramCard } from '@/components/public/ProgramCard';

export const revalidate = 3600;

/**
 * One indexable page per program.
 *
 * Every number and every workout here is computed from the program document
 * itself (see programMarketing.ts), so editing a program in the admin panel
 * updates its marketing page in the same act, and the page can never advertise
 * a twelve-week plan that is actually eight.
 *
 * The cover art is rendered `object-contain` in a square frame, matching the
 * landing page: these are badge and emblem images, and cropping them to a wide
 * banner cuts the artwork in half.
 */

export async function generateStaticParams() {
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
  const [all, brand] = await Promise.all([getPublicPrograms(), getPublicBranding()]);
  const related = all.filter((p) => p.slug !== slug && p.goal === program.goal).slice(0, 3);

  // Structured data: lets the page show up as a rich result rather than a
  // plain blue link, and costs nothing but markup.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: program.name,
    description: program.description,
    provider: { '@type': 'Organization', name: brand.appName },
    ...(program.imageUrl ? { image: program.imageUrl } : {}),
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: `P${program.weeks}W`,
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="relative">
        <TacticalBackdrop className="h-[640px]" />
        <div className="relative z-10">
          <PublicNav
            programs={all.map((p) => ({ name: p.name, slug: p.slug }))}
            logoUrl={brand.logoUrl}
            appName={brand.appName}
          />

          <header className="max-w-5xl mx-auto px-5 pt-8 pb-14 sm:pt-10 sm:pb-20">
            <Reveal>
              <Link href="/programs" className="text-xs text-text-tertiary hover:text-white transition-colors">
                ← All programs
              </Link>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-10 lg:gap-14 items-start mt-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-px bg-accent" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                      {m.stats[3]?.value} · {program.weeks} Weeks
                    </p>
                  </div>

                  <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight mt-5 leading-[0.98]">
                    {m.headline}
                  </h1>
                  <p className="text-base sm:text-lg text-text-secondary mt-5 leading-relaxed">
                    {m.subheadline}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-8">
                    {m.stats.map((s) => (
                      <div key={s.label} className="rounded-xl border border-white/8 bg-surface/70 backdrop-blur-sm p-3.5">
                        <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{s.label}</p>
                        <p className="text-lg font-black text-white mt-0.5">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-8">
                    {/* programId is what carries the choice through the quiz:
                        onboarding reads it (page.tsx:223) and enrols the user
                        in this exact program at the end. The landing page has
                        always passed it; these pages linked to a bare
                        /onboarding, so picking a program here picked nothing. */}
                    <Link
                      href={`/onboarding?programId=${program.id}`}
                      className="bg-accent text-black font-bold rounded-xl px-8 py-3.5 hover:opacity-90 transition-opacity"
                    >
                      Start this program free
                    </Link>
                    <p className="text-xs text-text-tertiary">
                      No charge until the trial ends · Cancel anytime
                    </p>
                  </div>
                </div>

                {/* Square frame, object-contain — the artwork is a badge, not a
                    photo, so it must never be cropped to fit a banner. */}
                <div className="relative w-full max-w-[300px] mx-auto lg:mx-0 aspect-square rounded-2xl border border-white/10 bg-surface-elevated overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,166,35,0.18),transparent_65%)]" />
                  {program.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={program.imageUrl}
                      alt={program.name}
                      className="relative w-full h-full object-contain p-5"
                    />
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <Dumbbell className="w-16 h-16 text-accent/30" />
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          </header>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 pb-24">
        <Reveal>
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              What this program is
            </h2>
            <p className="text-text-secondary mt-4 leading-relaxed whitespace-pre-line">{m.whoFor}</p>
            <div className="mt-6 rounded-xl border-l-2 border-accent bg-accent/[0.04] px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Before you start</p>
              <p className="text-sm text-text-secondary mt-1.5">{m.requirement}</p>
            </div>
          </section>
        </Reveal>

        {m.phases.length > 0 && (
          <Reveal>
            <section className="py-10 border-t border-white/8">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                How it&apos;s structured
              </h2>
              <p className="text-text-secondary mt-3">
                {m.phases.length} phases across {program.weeks} weeks. Each builds on the last —
                volume, intensity and complexity all move.
              </p>
              {/* A vertical timeline rather than a stack of boxes: it reads as
                  a progression, which is what a phased program actually is. */}
              <ol className="mt-7 relative border-l border-white/10 ml-3">
                {m.phases.map((ph, i) => (
                  <li key={i} className="relative pl-7 pb-7 last:pb-0">
                    <span className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-accent ring-4 ring-background" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{ph.weeks}</p>
                    <p className="font-black text-white mt-1">{ph.label}</p>
                    {ph.focus && <p className="text-sm text-text-tertiary mt-1.5">{ph.focus}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>
        )}

        {m.weekPattern.length > 0 && (
          <Reveal>
            <section className="py-10 border-t border-white/8">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                A week in this program
              </h2>
              <p className="text-text-secondary mt-3">
                {program.daysPerWeek} training days, {7 - program.daysPerWeek} rest.
                This pattern repeats — the work inside it doesn&apos;t.
              </p>
              <div className="mt-7 grid gap-2.5">
                {m.weekPattern.map((d, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 rounded-xl px-4 py-3.5 border transition-colors ${
                      d.isRest
                        ? 'border-white/5 bg-transparent'
                        : 'border-white/8 bg-surface hover:border-accent/25'
                    }`}
                  >
                    <span className={`text-[10px] font-black tracking-wider w-10 shrink-0 ${d.isRest ? 'text-text-tertiary/60' : 'text-accent'}`}>
                      D{i + 1}
                    </span>
                    <span className={`flex-1 text-sm ${d.isRest ? 'text-text-tertiary' : 'font-bold text-white'}`}>
                      {d.label}
                    </span>
                    {!d.isRest && (
                      <span className="text-xs text-text-tertiary shrink-0">{d.exerciseCount} exercises</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {m.sampleSessions.some((s) => s.exercises.length > 0) && (
          <Reveal>
            <section className="py-10 border-t border-white/8">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Real sessions from inside
              </h2>
              <p className="text-text-secondary mt-3">
                Straight out of the program — this is exactly what you see on the day.
              </p>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {m.sampleSessions.filter((s) => s.exercises.length > 0).map((s, i) => (
                  <div key={i} className="rounded-2xl border border-white/8 bg-surface overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
                      <p className="font-black text-white text-sm">{s.label}</p>
                    </div>
                    <ul className="p-5 space-y-3">
                      {s.exercises.map((e, j) => (
                        <li key={j} className="flex justify-between gap-3 items-baseline">
                          <span className="text-sm text-white/90">{e.name}</span>
                          <span className="text-[11px] text-accent font-medium whitespace-nowrap tabular-nums">
                            {e.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-tertiary mt-4">
                {m.totalSessions - 2} more sessions are inside the app, with every set logged as you go.
              </p>
            </section>
          </Reveal>
        )}

        <Reveal>
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">What you get</h2>
            <div className="mt-6 grid gap-3">
              {m.includes.map((item, i) => (
                <div key={i} className="flex gap-3.5 items-start rounded-xl border border-white/8 bg-surface px-4 py-3.5">
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-text-secondary">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="mt-6 relative rounded-3xl border border-accent/30 overflow-hidden p-10 sm:p-14 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,166,35,0.16),transparent_60%)]" />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                {program.weeks} weeks · {m.totalSessions} sessions
              </p>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-4">
                Start the first one today.
              </h2>
              <p className="text-text-secondary mt-4 max-w-lg mx-auto">
                Free to start. You won&apos;t be charged until the trial is up, and you can
                cancel before then.
              </p>
              <Link
                href={`/onboarding?programId=${program.id}`}
                className="inline-block mt-8 bg-accent text-black font-bold rounded-xl px-9 py-4 hover:opacity-90 transition-opacity"
              >
                Start {m.headline}
              </Link>
            </div>
          </section>
        </Reveal>
      </main>

      {related.length > 0 && (
        <section className="max-w-5xl mx-auto px-5 pb-24">
          <Reveal>
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-text-tertiary border-b border-white/8 pb-4">
              Similar programs
            </h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-3 mt-6">
            {related.map((r, i) => (
              <Reveal key={r.slug} delay={i * 0.05}>
                <ProgramCard p={r} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <PublicFooter appName={brand.appName} />
    </div>
  );
}
