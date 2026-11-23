export const dynamic = 'force-dynamic';

import { getLandingSettings } from '@/lib/serverConfig';
import { DEFAULT_LANDING_CONFIG } from '@/lib/landingDefaults';
import type { LandingPageConfig } from '@/types';
import LandingPage from './LandingClient';

// Fetched here, server-side, so the first HTML the browser ever sees
// already has the admin's real headline/subheadline baked in — no flash
// of DEFAULT_LANDING_CONFIG's placeholder copy while a client-side fetch
// resolves after mount (which is what caused the "old then new headline"
// flicker on every landing page load). membershipConfig is fetched here for
// the same reason — the primary CTA's label depends on trialDays, and
// without a server-fetched starting value it always rendered
// `landing.ctaPrimaryLabel` ("Get Matched Free") first, then visibly
// swapped to "Start N-Day Free Trial" the moment the client-side
// getMembershipConfig() call resolved a beat later.
import type { Metadata } from 'next';
import { PLAY_STORE_URL } from '@/lib/storeLinks';

const HOME_TITLE = 'Warfare Fitness: Military-Inspired Workout App & Training Programs';
const HOME_DESC = '14 structured training programs (fat loss, muscle, strength, calisthenics, military selection prep) with every session written out. Home or gym, beginner to advanced. Try it free for 7 days, no card.';
export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESC,
  alternates: { canonical: '/' },
  openGraph: { title: HOME_TITLE, description: HOME_DESC, url: '/', type: 'website' },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: HOME_DESC },
};

// What Google reads to understand the site: the brand, the site itself and
// the Android app. Plain data block; no script runs.
const HOME_JSON_LD = [
  { '@context': 'https://schema.org', '@type': 'Organization', name: 'Warfare Fitness', url: 'https://warfarefitness.com', logo: 'https://warfarefitness.com/brand/logo-wf.webp' },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Warfare Fitness', url: 'https://warfarefitness.com' },
  { '@context': 'https://schema.org', '@type': 'MobileApplication', name: 'Warfare Fitness', operatingSystem: 'Android, Web', applicationCategory: 'HealthApplication',
    description: HOME_DESC, installUrl: PLAY_STORE_URL, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: '7-day free trial' } },
];

export default async function Page() {
  // membershipPlans is server-fetched for the same reason as
  // membershipConfig: the hero's "$X for N days, then $Y/mo" line is priced
  // off the featured plan, so loading plans client-side left that line
  // missing for the first second of every visit — the one line that states
  // what the visitor is actually agreeing to pay.
  // Read fresh through the Admin SDK (see serverConfig.ts): the first
  // paint must match the admin's latest trial and pricing settings.
  const { system: cfg, membership: membershipConfig, plans: membershipPlansRaw } = await getLandingSettings();
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;
  const initialLanding: LandingPageConfig = cfg?.landingPage
    ? { ...DEFAULT_LANDING_CONFIG, ...(cfg.landingPage as LandingPageConfig) }
    : DEFAULT_LANDING_CONFIG;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }} />
    <LandingPage
      initialAppName={initialAppName}
      initialLogoUrl={initialLogoUrl}
      initialLanding={initialLanding}
      initialMembership={membershipConfig}
      initialMembershipPlans={membershipPlansRaw}
    />
    </>
  );
}
