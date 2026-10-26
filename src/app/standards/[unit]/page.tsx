import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StandardsTest } from '../StandardsTest';
import {
  UNIT_STANDARDS, standardBySlug, slugFor, formatSeconds, formatMinutes,
  type UnitStandard,
} from '@/lib/ptStandards';

/**
 * One page per selection course.
 *
 * These exist for search, not for browsing. People look up "marine recon pft
 * requirements" every day of the year and currently land on forum posts from
 * a decade ago. A page with the real numbers, the source, and a test on it
 * keeps earning long after a video has stopped being shown to anyone — which
 * is the difference between renting an audience from an algorithm and owning
 * one.
 *
 * Rendered at build time from the same data the app uses.
 */

export function generateStaticParams() {
  return UNIT_STANDARDS.map((s) => ({ unit: slugFor(s.id) }));
}

/** "15 pull-ups, 60 push-ups and a 3-mile run in 19:30" — for the meta description. */
function summarise(s: UnitStandard): string {
  const bits: string[] = [];
  if (s.events.pullups !== undefined) bits.push(`${s.events.pullups} pull-ups`);
  if (s.events.pushups !== undefined) bits.push(`${s.events.pushups} push-ups`);
  if (s.events.situps !== undefined) bits.push(`${s.events.situps} sit-ups`);
  if (s.events.plankSeconds !== undefined) bits.push(`a ${formatSeconds(s.events.plankSeconds)} plank`);
  if (s.events.beepLevel !== undefined) bits.push(`bleep level ${s.events.beepLevel}`);
  if (s.events.runMinutes !== undefined) bits.push(`${s.runLabel ?? 'run'} in ${formatMinutes(s.events.runMinutes)}`);
  if (bits.length <= 1) return bits[0] ?? '';
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

export async function generateMetadata({ params }: { params: Promise<{ unit: string }> }): Promise<Metadata> {
  const { unit } = await params;
  const s = standardBySlug(unit);
  if (!s) return { title: 'Standard not found' };

  const title = `${s.resultTitle} — Fitness Requirements`;
  const description = `${s.resultTitle} fitness standard: ${summarise(s)}. Enter your own numbers and see if you would pass.`;
  return {
    title,
    description,
    alternates: { canonical: `/standards/${slugFor(s.id)}` },
    openGraph: { title: `Could you pass the ${s.label} standard?`, description, type: 'article' },
  };
}

export default async function UnitStandardPage({ params }: { params: Promise<{ unit: string }> }) {
  const { unit } = await params;
  const standard = standardBySlug(unit);
  if (!standard) notFound();

  return (
    <>
      <Link href="/standards" className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> All standards
      </Link>

      <div className="mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          {standard.flag} Published standard
        </p>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mt-3 leading-[1.05]">
          Could you pass {standard.label}?
        </h1>
        <p className="text-base text-text-secondary mt-4 max-w-xl leading-relaxed">{standard.description}</p>
      </div>

      {/* Preselected to this unit, and the same component as the index so the
          numbers and the arithmetic can never diverge between the two. */}
      <StandardsTest initialStandardId={standard.id} />

      {standard.notTracked && (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary">
            What this test leaves out
          </p>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">{standard.notTracked}</p>
          <p className="text-xs text-text-tertiary mt-3">
            Those cannot be reproduced safely or honestly on your own, so they are not scored here.
            Clearing the numbers above means you would not be sent home on the fitness test. It does not
            mean you would pass the course.
          </p>
        </div>
      )}
    </>
  );
}
