import type { Metadata } from 'next';
import { StrengthScoreClient } from './StrengthScoreClient';

export const dynamic = 'force-static';

const title = 'Warfare Strength Score — How Strong Are You?';
const description = 'Free strength calculator. Enter your squat, bench and deadlift to get your Warfare Strength Score, percentile ranking and strength profile — no account required.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/strength-score' },
  openGraph: {
    title, description, type: 'website', url: '/strength-score',
  },
  twitter: {
    card: 'summary_large_image', title, description,
  },
};

export default function StrengthScorePage() {
  return <StrengthScoreClient />;
}
