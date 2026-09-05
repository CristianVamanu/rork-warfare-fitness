export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public leaderboard — no auth required, called directly from the
 * logged-out landing page. Firestore's `users` collection itself requires
 * auth to read, so this route uses the Admin SDK server-side and returns
 * only marketing-safe fields (first name + last initial, level, streak,
 * workout count). Never returns email or any other PII.
 *
 * Unauthenticated and previously uncached and unlimited — each hit read 200
 * user documents. Cached for a minute (five at a CDN) and rate limited per
 * IP so the landing page can't be looped into a Firestore bill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

function toDisplayLabel(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function GET(req: NextRequest) {
  try {
    const limit = await rateLimit({ scope: 'public-leaderboard', key: clientIp(req), windowMs: 60_000, max: 30 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ entries: [] });
    const db = getAdminDb(app);

    // Was `.limit(200)` with NO orderBy — Firestore then returns the first
    // 200 documents by ID (effectively random uids), so the "top 10" was
    // ranked within an arbitrary slice rather than across the user base:
    // with thousands of users the actual #1 athlete almost never appeared.
    const snap = await db.collection('users').orderBy('powerLevel', 'desc').limit(200).get();
    const entries = snap.docs
      .filter((d) => !d.data().banned)
      .map((d) => {
        const u = d.data();
        const totalWorkouts = u.statsCache?.totalWorkouts ?? u.stats?.totalWorkouts ?? 0;
        const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
        return {
          displayName: toDisplayLabel((u.displayName as string) || 'Athlete'),
          powerLevel: (u.powerLevel as number) ?? 0,
          streak,
          totalWorkouts,
        };
      })
      .filter((e) => e.totalWorkouts > 0)
      .sort((a, b) => b.powerLevel - a.powerLevel)
      .slice(0, 10);

    return NextResponse.json({ entries }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/leaderboard] Error:', err);
    return NextResponse.json({ entries: [] });
  }
}
