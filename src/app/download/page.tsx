export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import DownloadClient from './DownloadClient';

export default async function Page() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;

  return <DownloadClient initialAppName={initialAppName} initialLogoUrl={initialLogoUrl} />;
}
