import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { exchangeCodeForTokens, fetchLatestSummary } from '@/lib/whoop';
import { encryptSecret } from '@/lib/crypto';

/** Browser lands here straight from WHOOP after the user approves access — no auth header available, state doc resolves the uid. */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const settingsUrl = (query: string) => NextResponse.redirect(`${appUrl}/settings?${query}`);

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  if (error) return settingsUrl('whoop=denied');
  if (!code || !state) return settingsUrl('whoop=error');

  const app = getAdminApp();
  if (!app) return settingsUrl('whoop=error');
  const db = getAdminDb(app);

  try {
    const stateDoc = await db.collection('whoopOAuthState').doc(state).get();
    if (!stateDoc.exists) return settingsUrl('whoop=error');
    const { uid, createdAt } = stateDoc.data() as { uid: string; createdAt: number };
    await stateDoc.ref.delete();
    if (Date.now() - createdAt > 10 * 60 * 1000) return settingsUrl('whoop=expired');

    const redirectUri = `${appUrl}/api/whoop/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const summary = await fetchLatestSummary(tokens.accessToken).catch(() => null);

    await db.collection('integrations').doc(uid).set({
      whoop: {
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        connectedAt: Date.now(),
        ...(summary ? { summary } : {}),
      },
    }, { merge: true });

    return settingsUrl('whoop=connected');
  } catch (err) {
    console.error('[whoop/callback] Error:', err);
    return settingsUrl('whoop=error');
  }
}
