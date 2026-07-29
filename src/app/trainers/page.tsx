export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_B2B_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { B2BLandingConfig } from '@/types';
import TrainersLandingPage from './TrainersLandingClient';

export default async function Page() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;
  const initialB2b: B2BLandingConfig = cfg?.b2bLandingPage
    ? { ...DEFAULT_B2B_LANDING_CONFIG, ...(cfg.b2bLandingPage as B2BLandingConfig) }
    : DEFAULT_B2B_LANDING_CONFIG;

  return (
    <TrainersLandingPage
      initialAppName={initialAppName}
      initialLogoUrl={initialLogoUrl}
      initialConfig={initialB2b}
    />
  );
}
