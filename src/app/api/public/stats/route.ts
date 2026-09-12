export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, real usage stats for the logged-out landing page's social-proof
 * strip — no auth required, no PII, and no invented numbers. Uses Firestore
 * count() aggregation queries so it costs one read regardless of collection
 * size, not a full scan.
 *
 * Unauthenticated and previously uncached and unlimited: a loop against it
 * ran two aggregations over the whole users/events collections per hit.
 * Cached for a minute (five at a CDN) and rate limited per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET(req: NextRequest) {
  try {
    const limit = await rateLimit({ scope: 'public-stats', key: clientIp(req), windowMs: 60_000, max: 30 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ totalUsers: 0, totalWorkouts: 0 });
    const db = getAdminDb(app);

    const [usersCount, workoutsCount] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('events').where('type', '==', 'WORKOUT_COMPLETED').count().get(),
    ]);

    return NextResponse.json({
      totalUsers: usersCount.data().count,
      totalWorkouts: workoutsCount.data().count,
    }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/stats] Error:', err);
    return NextResponse.json({ totalUsers: 0, totalWorkouts: 0 });
  }
}
