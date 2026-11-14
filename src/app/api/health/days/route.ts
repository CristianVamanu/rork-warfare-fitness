export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?dates=YYYY-MM-DD,YYYY-MM-DD,… — the member's own stored day summaries
 * (healthDays/{uid}_{date}), read with the Admin SDK.
 *
 * The dashboard used to read these straight from Firestore, which depends
 * on the healthDays read rule being published to the project. On a
 * deployment where rules are not pushed automatically that read was refused
 * and swallowed, so the watch panel showed zeros although the sync had
 * stored everything. Going through the server removes that dependency.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { dropAndroidHeart } from '@/lib/healthHeart';

export async function GET(req: NextRequest) {
  const auth = await verifyAuthedNotTfaPending(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await rateLimit({ scope: 'health-days', key: auth.uid, windowMs: 60_000, max: 30 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const dates = (req.nextUrl.searchParams.get('dates') ?? '').split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 62);
  if (!dates.length) return NextResponse.json({ days: [] });
  const db = getAdminDb(app);
  const snaps = await db.getAll(...dates.map((d) => db.doc(`healthDays/${auth.uid}_${d}`)));
  const days = snaps.filter((s) => s.exists).map((s) => {
    const { updatedAt: _u, userId: _id, ...rest } = s.data() as Record<string, unknown>;
    return dropAndroidHeart(rest);
  });
  return NextResponse.json({ days });
}
