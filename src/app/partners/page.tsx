export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PartnersApplyClient } from './PartnersApplyClient';

export const metadata: Metadata = {
  title: 'Partner program',
  description: 'Earn a recurring share of every membership you refer. Apply to become a partner.',
};

export default async function Page() {
  const [programs, brand] = await Promise.all([getPublicPrograms().catch(() => []), getPublicBranding()]);
  return (
    <PartnersApplyClient
      initialAppName={brand.appName}
      initialLogoUrl={brand.logoUrl}
      programs={programs.map((p) => ({ name: p.name, slug: p.slug }))}
    />
  );
}
