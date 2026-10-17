export const dynamic = 'force-dynamic';

import { getSystemConfig } from '@/lib/firestore';
import ForgotPasswordClient from './ForgotPasswordClient';

// Fetched here, server-side, so the very first HTML already has the real
// app name/logo baked in — no flash of the fallback letter while a
// client-side fetch resolves after mount.
export default async function ForgotPasswordPage() {
  const cfg = await getSystemConfig().catch(() => null);
  const initialAppName = (cfg?.appName as string) || 'Warfare Fitness';
  const initialLogoUrl = (cfg?.logoUrl as string) || null;

  return <ForgotPasswordClient initialAppName={initialAppName} initialLogoUrl={initialLogoUrl} />;
}
