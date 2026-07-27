export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { LandingPageConfig } from '@/types';
import LandingPage from './LandingClient';

// Fetched here, server-side, so the first HTML the browser ever sees
// already has the admin's real headline/subheadline baked in — no flash
// of DEFAULT_LANDING_CONFIG's placeholder copy while a client-side fetch
// resolves after mount (which is what caused the "old then new headline"
// flicker on every landing page load).
export default async function Page() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;
  const initialLanding: LandingPageConfig = cfg?.landingPage
    ? { ...DEFAULT_LANDING_CONFIG, ...(cfg.landingPage as LandingPageConfig) }
    : DEFAULT_LANDING_CONFIG;

  return (
    <LandingPage
      initialAppName={initialAppName}
      initialLogoUrl={initialLogoUrl}
      initialLanding={initialLanding}
    />
  );
}
