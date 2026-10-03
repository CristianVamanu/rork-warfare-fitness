export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import LoginClient from './LoginClient';

// Fetched here, server-side, so the very first HTML already has the real
// app name/logo baked in — no flash of the default placeholder (or the
// bare fallback letter) while a client-side fetch resolves after mount.
export default async function LoginPage() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;

  return <LoginClient initialAppName={initialAppName} initialLogoUrl={initialLogoUrl} />;
}
