import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

/**
 * Branding for the public pages, read with the Admin SDK.
 *
 * The layout's own getBranding() goes through the CLIENT SDK on the server,
 * which is the source of the build-time auth/invalid-api-key noise. These
 * pages are statically revalidated, so they read through the admin credentials
 * the rest of the server already uses.
 */
let cache: { at: number; value: { appName: string; logoUrl: string | null } } | null = null;

export async function getPublicBranding(): Promise<{ appName: string; logoUrl: string | null }> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const fallback = { appName: 'Warfare Fitness', logoUrl: null };
  try {
    const app = getAdminApp();
    if (!app) return fallback;
    const snap = await getAdminDb(app).collection('system').doc('config').get();
    const value = {
      appName: (snap.data()?.appName as string) || fallback.appName,
      logoUrl: (snap.data()?.logoUrl as string) || null,
    };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return fallback;
  }
}
