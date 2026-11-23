export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_B2B_LANDING_CONFIG, freshB2b } from '@/lib/landingDefaults';
import type { B2BLandingConfig } from '@/types';
import TrainersLandingPage from './TrainersLandingClient';

import type { Metadata } from 'next';

const T_TITLE = 'White-Label Fitness App for Personal Trainers & Gyms | Warfare Fitness';
const T_DESC = 'Your own branded fitness app: web, Android and iPhone, with your logo, programs and pricing. AI program matching, nutrition, community and a coach dashboard. One-time price, you own it.';
export const metadata: Metadata = {
  title: T_TITLE, description: T_DESC, alternates: { canonical: '/trainers' },
  openGraph: { title: T_TITLE, description: T_DESC, url: '/trainers', type: 'website' },
};

export default async function Page() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;
  const initialB2b: B2BLandingConfig = cfg?.b2bLandingPage
    ? freshB2b({ ...DEFAULT_B2B_LANDING_CONFIG, ...(cfg.b2bLandingPage as B2BLandingConfig) })
    : DEFAULT_B2B_LANDING_CONFIG;

  return (
    <TrainersLandingPage
      initialAppName={initialAppName}
      initialLogoUrl={initialLogoUrl}
      initialConfig={initialB2b}
    />
  );
}
