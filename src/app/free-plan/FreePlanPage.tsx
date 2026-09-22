import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { getSystemConfig } from '@/lib/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { freePlanConfig, findOffer, offerCopy, offerPath, type FreePlanConfig } from '@/lib/freePlan';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { FreePlanClient } from './FreePlanClient';
import type { Program } from '@/types';

/**
 * One lead-magnet page per program, all from this file.
 *
 * /free-plan shows the admin's default offer; /free-plan/<slug> shows that
 * program. Same layout, same voice — only the program card and the copy
 * change, so every ad lands on a page that talks about the program the ad
 * talked about. A program that is not on offer is a 404, not a fallback:
 * an old ad link must never quietly hand out a different program.
 */

type Loaded = {
  cfg: Record<string, unknown> | null;
  plan: FreePlanConfig;
  offer: NonNullable<ReturnType<typeof findOffer>>;
  program: Pick<Program, 'id' | 'name' | 'description' | 'weeks' | 'daysPerWeek' | 'level' | 'imageUrl' | 'goal' | 'recommendedForGoals'>;
  copy: { headline: string; subheadline: string };
};

async function load(programId: string | undefined): Promise<Loaded | null> {
  const cfg = (await getSystemConfig().catch(() => null)) as Record<string, unknown> | null;
  const plan = freePlanConfig(cfg as { freePlan?: Record<string, unknown> } | null);
  const offer = findOffer(plan, programId);
  if (!offer) return null;

  let program: Loaded['program'] | null = null;
  const app = getAdminApp();
  if (app) {
    const snap = await getAdminDb(app).collection('programs').doc(offer.id).get().catch(() => null);
    if (snap?.exists) program = { ...(snap.data() as Program), id: snap.id };
  }
  if (!program) program = MOCK_PROGRAMS.find((p) => p.id === offer.id) ?? null;
  if (!program) return null;

  return { cfg, plan, offer, program, copy: offerCopy(offer, program, plan.days) };
}

export async function freePlanMetadata(programId?: string): Promise<Metadata> {
  const data = await load(programId);
  if (!data) return { title: 'Free plan', robots: { index: false } };
  return {
    title: data.copy.headline,
    description: data.copy.subheadline,
    alternates: { canonical: programId ? offerPath(data.offer) : '/free-plan' },
    openGraph: {
      title: data.copy.headline,
      description: data.copy.subheadline,
      ...(data.program.imageUrl ? { images: [{ url: data.program.imageUrl }] } : {}),
    },
  };
}

export async function FreePlanPage({ programId }: { programId?: string }) {
  const data = await load(programId);
  if (!data) notFound();
  const { cfg, plan, program, copy } = data;

  const appName = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = (cfg?.logoUrl as string) || null;
  const others = plan.offers.filter((o) => o.id !== program.id).map((o) => ({ id: o.id, name: o.name, path: offerPath(o) }));

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      <div aria-hidden className="wf-field" />
      <PublicHeader appName={appName} logoUrl={logoUrl} />
      <main className="relative">
        <FreePlanClient
          headline={copy.headline}
          subheadline={copy.subheadline}
          days={plan.days}
          others={others}
          program={{
            id: program.id,
            name: program.name,
            description: program.description,
            weeks: program.weeks,
            daysPerWeek: program.daysPerWeek,
            level: program.level,
            imageUrl: program.imageUrl ?? null,
          }}
        />
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
