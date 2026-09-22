import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { getSystemConfig } from '@/lib/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { freePlanConfig } from '@/lib/freePlan';
import { MOCK_PROGRAMS } from '@/lib/programs';
import type { Program } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * The chooser: every program on offer, one tap each to its own page.
 *
 * This is the link for an organic post — "here's a free week, pick your
 * program" — where the reader has not yet been told which program the
 * post is about. Paid ads skip it and land on the single-program page,
 * because an ad has already made the choice. Two links, two jobs.
 *
 * The cards carry no email field. One decision per page: here it is
 * which program; on the next page it is whether to hand over an email.
 */

const DAYS_WORD: Record<number, string> = { 7: 'seven days', 14: 'two weeks', 30: 'thirty days' };

async function load() {
  const cfg = (await getSystemConfig().catch(() => null)) as Record<string, unknown> | null;
  const plan = freePlanConfig(cfg as { freePlan?: Record<string, unknown> } | null);
  if (!plan.enabled) return null;

  type Card = Pick<Program, 'id' | 'name' | 'description' | 'weeks' | 'daysPerWeek' | 'level' | 'imageUrl'>;
  const byId = new Map<string, Card>();
  const app = getAdminApp();
  if (app) {
    const db = getAdminDb(app);
    const snaps = await db.getAll(...plan.offers.map((o) => db.collection('programs').doc(o.id))).catch(() => []);
    for (const s of snaps) if (s.exists) byId.set(s.id, { ...(s.data() as Program), id: s.id });
  }
  for (const o of plan.offers) {
    if (!byId.has(o.id)) {
      const m = MOCK_PROGRAMS.find((p) => p.id === o.id);
      if (m) byId.set(o.id, m);
    }
  }
  // Keep the admin's order, default first.
  const programs = [plan.programId, ...plan.offers.map((o) => o.id).filter((id) => id !== plan.programId)]
    .map((id) => byId.get(id)).filter((p): p is Card => Boolean(p));
  if (programs.length === 0) return null;
  return { cfg, plan, programs };
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await load();
  if (!data) return { title: 'Free plan', robots: { index: false } };
  const title = `Pick your free ${DAYS_WORD[data.plan.days] ?? `${data.plan.days} days`} of training`;
  const description = 'Choose a program. One real session lands in your inbox every morning. No account, no card.';
  return { title, description, alternates: { canonical: '/free-plan/pick' }, openGraph: { title, description } };
}

export default async function PickPage() {
  const data = await load();
  if (!data) notFound();
  const { cfg, plan, programs } = data;
  const appName = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = (cfg?.logoUrl as string) || null;
  const daysWord = DAYS_WORD[plan.days] ?? `${plan.days} days`;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      <div aria-hidden className="wf-field" />
      <PublicHeader appName={appName} logoUrl={logoUrl} />
      <main className="relative max-w-2xl mx-auto px-5 pt-10 pb-14 sm:pt-16">
        <p className="wf-readout text-[10px] font-bold text-accent mb-4">Free · {plan.days} days · no account needed</p>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.12] text-balance">
          <span className="wf-lit">Pick your program. Get {daysWord} of it, free.</span>
        </h1>
        <p className="text-[15px] sm:text-base text-text-secondary leading-relaxed mt-4 text-balance">
          One real session in your inbox every morning, taken straight from the program you choose. No account, no card. Decide when it is done.
        </p>

        <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {programs.map((p) => {
            const level = p.level.charAt(0).toUpperCase() + p.level.slice(1);
            return (
              <li key={p.id}>
                <Link
                  href={`/free-plan/${p.id}`}
                  className="group relative overflow-hidden flex flex-col h-full rounded-2xl border border-white/10 bg-surface p-4 hover:border-accent/50 transition-colors"
                >
                  <div aria-hidden className="wf-ember pointer-events-none absolute inset-0 opacity-70" />
                  <div className="relative flex items-start gap-3">
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-black text-white leading-tight">{p.name}</p>
                      <p className="text-[11px] text-text-tertiary mt-1">{p.weeks} weeks · {p.daysPerWeek} days a week · {level}</p>
                    </div>
                  </div>
                  <p className="relative text-[13px] text-text-secondary leading-relaxed mt-3 line-clamp-3">{p.description}</p>
                  <span className="relative mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent">
                    Send me day one <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] text-text-tertiary leading-relaxed text-center mt-8">
          {plan.days} emails, one a day, then nothing unless you ask for more. Unsubscribe in any of them.
        </p>
      </main>
      <footer className="relative border-t border-white/8 mt-6">
        <p className="max-w-lg mx-auto px-5 py-6 text-[11px] text-text-tertiary leading-relaxed">
          {appName} is not affiliated with, endorsed by, or connected to any armed force or government. Programs are
          general fitness programs inspired by military training; they are not official selection preparation.
        </p>
      </footer>
    </div>
  );
}
