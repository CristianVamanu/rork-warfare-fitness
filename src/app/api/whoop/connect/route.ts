import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { buildAuthorizeUrl, isWhoopEnabled } from '@/lib/whoop';

/**
 * Starts the WHOOP OAuth flow. Called via fetch (not a direct browser
 * navigation) since it needs the caller's auth token — returns the
 * authorize URL for the client to redirect to. A short-lived state doc
 * carries the uid through the WHOOP redirect, since the callback lands
 * unauthenticated (WHOOP, not our client, hits it).
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not configured' }, { status: 500 });

  const db = getAdminDb(app);
  if (!(await isWhoopEnabled(db))) {
    return NextResponse.json({ error: 'WHOOP sync is currently disabled' }, { status: 403 });
  }

  const state = randomBytes(24).toString('hex');
  await db.collection('whoopOAuthState').doc(state).set({ uid: check.uid, createdAt: Date.now() });

  const redirectUri = `${appUrl}/api/whoop/callback`;
  const url = await buildAuthorizeUrl(redirectUri, state);
  if (!url) return NextResponse.json({ error: 'WHOOP is not configured. Set WHOOP_CLIENT_ID/WHOOP_CLIENT_SECRET in Admin -> Integrations.' }, { status: 500 });

  return NextResponse.json({ url });
}
