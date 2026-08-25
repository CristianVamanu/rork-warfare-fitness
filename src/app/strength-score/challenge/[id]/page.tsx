import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStrengthScoreResult } from '@/lib/strengthScoreStore';
import { ChallengeClient } from './ChallengeClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const doc = await getStrengthScoreResult(params.id).catch(() => null);
  if (!doc) return { title: 'Warfare Strength Score Challenge' };
  const name = doc.displayName || 'A Warrior';
  const title = `${name} thinks they're strong. Warfare Score: ${doc.score}. Can you beat them?`;
  const description = `Accept the challenge — take the free Warfare Strength Test and see if you can beat ${name}'s score of ${doc.score}.`;
  return {
    title, description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function StrengthScoreChallengePage({ params }: { params: { id: string } }) {
  const doc = await getStrengthScoreResult(params.id).catch(() => null);
  if (!doc) notFound();
  return <ChallengeClient challenger={doc} />;
}
