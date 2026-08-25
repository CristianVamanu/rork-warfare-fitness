import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStrengthScoreResult } from '@/lib/strengthScoreStore';
import { calculateStrengthScore } from '@/lib/strengthScore';
import { StrengthScoreResultView } from '@/components/strength-score/StrengthScoreResultView';
import { PublicResultCta } from '../../PublicResultCta';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const doc = await getStrengthScoreResult(params.id).catch(() => null);
  if (!doc) return { title: 'Warfare Strength Score' };
  const name = doc.displayName || 'A Warrior';
  const title = `${name} scored ${doc.score}/100 on the Warfare Strength Test`;
  const description = `${name} is ${doc.classification} — think you can beat their score? Take the free Warfare Strength Test.`;
  return {
    title, description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function StrengthScoreResultPage({ params }: { params: { id: string } }) {
  const doc = await getStrengthScoreResult(params.id).catch(() => null);
  if (!doc) notFound();

  const result = calculateStrengthScore({
    age: doc.age, sex: doc.sex, bodyweightKg: doc.bodyweightKg,
    squatKg: doc.squatKg, benchKg: doc.benchKg, deadliftKg: doc.deadliftKg,
    ohpKg: doc.ohpKg ?? undefined, pullupReps: doc.pullupReps ?? undefined,
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <StrengthScoreResultView result={result} displayName={doc.displayName} sex={doc.sex} />
      <PublicResultCta />
    </div>
  );
}
