import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { getSystemConfig } from '@/lib/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { freePlanConfig } from '@/lib/freePlan';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { FreePlanClient } from './FreePlanClient';
import type { Program } from '@/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSystemConfig().catch(() => null);
  const plan = freePlanConfig(cfg as { freePlan?: Record<string, unknown> } | null);
  return {
    title: plan.headline,
    description: plan.subheadline,
    alternates: { canonical: '/free-plan' },
  };
}

/**
 * The lead-magnet page. One screen: a headline, one field, one button, and
 * the program it comes from shown as the thing you are about to receive.
 *
 * Everything on it comes from the admin's choice in Emails → Free plan:
 * which program, how many days, the two lines of copy. Off means 404 —
 * a lead magnet with nothing behind it must not exist as a URL.
 */
export default async function FreePlanPage() {
  const cfg = await getSystemConfig().catch(() => null);
  const plan = freePlanConfig(cfg as { freePlan?: Record<string, unknown> } | null);
  if (!plan.enabled) notFound();

  // The program card is rendered server-side from the real record so the
  // first paint already shows what the visitor gets — not a spinner.
  let program: Pick<Program, 'name' | 'description' | 'weeks' | 'daysPerWeek' | 'level' | 'imageUrl'> | null = null;
  const app = getAdminApp();
  if (app) {
    const snap = await getAdminDb(app).collection('programs').doc(plan.programId).get().catch(() => null);
    if (snap?.exists) program = snap.data() as Program;
  }
  if (!program) program = MOCK_PROGRAMS.find((p) => p.id === plan.programId) ?? null;
  if (!program) notFound();

  const appName = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = (cfg?.logoUrl as string) || null;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      <div aria-hidden className="wf-field" />
      <PublicHeader appName={appName} logoUrl={logoUrl} />
      <main className="relative">
        <FreePlanClient
          headline={plan.headline}
          subheadline={plan.subheadline}
          days={plan.days}
          program={{
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
