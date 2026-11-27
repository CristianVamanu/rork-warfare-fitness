export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { getLandingSettings } from '@/lib/serverConfig';
import { trialNote } from '@/lib/trialNote';
import { QuizFirstLanding } from '@/components/landing/AdLanders';

// Ad landing page (see AdLanders.tsx). Kept out of search results: the home
// page is the one Google should rank.
export const metadata: Metadata = { title: 'Build your training plan in 2 minutes | Warfare Fitness', robots: { index: false, follow: false }, alternates: { canonical: '/' } };

export default async function Page() {
  const { membership } = await getLandingSettings();
  return <QuizFirstLanding note={trialNote(membership)} />;
}
