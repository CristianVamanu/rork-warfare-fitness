import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Dumbbell, Check, Lock } from 'lucide-react';
import { getPublicPrograms, getPublicProgramBySlug } from '@/lib/publicPrograms';
import { buildProgramMarketing } from '@/lib/programMarketing';
import { getPublicBranding, getPublicTrialTerms } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { Reveal } from '@/components/public/Reveal';
import { ProgramCard } from '@/components/public/ProgramCard';

export const revalidate = 3600;

/**
 * One indexable page per program.
 *
 * Every number here is computed from the program document itself, so editing a
 * program in the admin panel updates its page in the same act. The training
 * PRESCRIPTION is deliberately absent — no exercises, sets, reps or rest. See
 * programMarketing.ts for why that costs nothing in search and protects the
 * thing people are paying for.
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

  const [all, brand, terms] = await Promise.all([
    getPublicPrograms(),
    getPublicBranding(),
    getPublicTrialTerms(),
  ]);
  const m = buildProgramMarketing(program, terms.disclosure);
  const related = all.filter((p) => p.slug !== slug && p.goal === program.goal).slice(0, 3);

  // Course + FAQPage structured data. The FAQ block is the cheapest ranking
  // win available here: it can occupy extra vertical space in results, and it
  // answers the questions people actually type.
  const jsonLd = [
    {
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
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: m.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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
                    {/* Built from the level and goal directly, not by indexing
                        into the stats array — reordering stats used to change
                        this heading silently. */}
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
                      {m.eyebrow}
                    </p>
                  </div>

                  <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight mt-5 leading-[0.98]">
                    {m.headline}
                  </h1>
                  <p className="text-lg sm:text-xl text-white/90 mt-5 leading-relaxed font-medium">
                    {m.hook}
                  </p>
                  <p className="text-sm sm:text-base text-text-secondary mt-3 leading-relaxed">
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
                    <Link
                      href={`/onboarding?programId=${program.id}`}
                      className="bg-accent text-black font-bold rounded-xl px-8 py-3.5 hover:opacity-90 transition-opacity"
                    >
                      Start this program
                    </Link>
                    <p className="text-xs text-text-tertiary">
                      {terms.disclosure}
                    </p>
                  </div>
                </div>

                <div className="relative w-full max-w-[300px] mx-auto lg:mx-0 aspect-square rounded-2xl border border-white/10 bg-surface-elevated overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,166,35,0.18),transparent_65%)]" />
                  {program.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={program.imageUrl} alt={program.name} className="relative w-full h-full object-contain p-5" />
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
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">What this program is</h2>
            <p className="text-text-secondary mt-4 leading-relaxed whitespace-pre-line">{m.whoFor}</p>
            <p className="text-text-secondary mt-4 leading-relaxed">{m.honest}</p>
          </section>
        </Reveal>

        <Reveal>
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">What it does to you</h2>
            <div className="mt-6 grid gap-3">
              {m.outcomes.map((o, i) => (
                <div key={i} className="flex gap-3.5 items-start rounded-xl border border-white/8 bg-surface px-4 py-3.5">
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-text-secondary leading-relaxed">{o}</span>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {m.phases.length > 0 && (
          <Reveal>
            <section className="py-10 border-t border-white/8">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">How it&apos;s built</h2>
              <p className="text-text-secondary mt-3">
                {m.phases.length} phases across {program.weeks} weeks. Each one escalates on the last —
                volume, intensity and complexity all move, and the deloads are planned rather than forced on you.
              </p>
              <ol className="mt-7 relative border-l border-white/10 ml-3">
                {m.phases.map((ph, i) => (
                  <li key={i} className="relative pl-7 pb-7 last:pb-0">
                    <span className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-accent ring-4 ring-background" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{ph.weeks}</p>
                    <p className="font-black text-white mt-1">{ph.label}</p>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>
        )}

        <Reveal>
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">The commitment</h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <div className="rounded-2xl border border-white/8 bg-surface p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Your week</p>
                <p className="text-3xl font-black text-white mt-2 tabular-nums">
                  {m.rhythm.trainingDays}<span className="text-text-tertiary text-xl"> / 7</span>
                </p>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{m.rhythm.description}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-surface p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent">What you need</p>
                <ul className="mt-3 space-y-2">
                  {m.equipment.map((e) => (
                    <li key={e} className="flex gap-2.5 items-start text-sm text-text-secondary">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-sm text-text-tertiary mt-4">{m.commitment}</p>
          </section>
        </Reveal>

        {/* Deliberately NOT a sample workout. The prescription is the product —
            this states that plainly instead of publishing two sessions of it. */}
        <Reveal>
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Inside the program</h2>
            <div className="mt-6 rounded-2xl border border-accent/25 bg-surface overflow-hidden">
              <div className="px-6 py-5 border-b border-white/8 flex items-center gap-3">
                <Lock className="w-4 h-4 text-accent shrink-0" />
                <p className="text-sm font-bold text-white">
                  {m.totalSessions} sessions, written and ordered
                </p>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-text-secondary leading-relaxed">
                  Every session is laid out move by move with the sets, reps, tempo and rest
                  prescribed — you open the app and do what it says. The progression is already
                  decided, so nothing is left to how you feel on the day. That plan is what
                  you&apos;re paying for, so it lives inside the app rather than on this page.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {m.includes.slice(0, 4).map((i) => (
                    <span key={i} className="text-[11px] text-text-tertiary border border-white/10 rounded-full px-3 py-1.5">
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </Reveal>

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
          <section className="py-10 border-t border-white/8">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Questions</h2>
            <div className="mt-6 divide-y divide-white/8 border-y border-white/8">
              {m.faq.map((f, i) => (
                <details key={i} className="group py-4">
                  <summary className="flex justify-between items-center gap-4 cursor-pointer list-none">
                    <span className="text-sm font-bold text-white">{f.q}</span>
                    <span className="text-accent text-lg shrink-0 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="text-sm text-text-secondary mt-3 leading-relaxed">{f.a}</p>
                </details>
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
                {terms.disclosure}
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
