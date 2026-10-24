export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { getSystemConfig } from '@/lib/firestore';
import { PartnersApplyClient } from './PartnersApplyClient';

export const metadata: Metadata = {
  title: 'Partner program',
  description: 'Earn a recurring share of every membership you refer. Apply to become a partner.',
};

export default async function Page() {
  const cfg = await getSystemConfig().catch(() => null);
  return (
    <PartnersApplyClient
      initialAppName={(cfg?.appName as string) || 'Warfare Fitness'}
      initialLogoUrl={(cfg?.logoUrl as string) || null}
    />
  );
}
