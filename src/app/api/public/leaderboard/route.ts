export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public leaderboard — no auth required, called directly from the
 * logged-out landing page. Firestore's `users` collection itself requires
 * auth to read, so this route uses the Admin SDK server-side and returns
 * only marketing-safe fields (first name + last initial, level, streak,
 * workout count). Never returns email or any other PII.
 */

import { NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

function toDisplayLabel(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function GET() {
  try {
    const app = getAdminApp();
    if (!app) return NextResponse.json({ entries: [] });
    const db = getAdminDb(app);

    const snap = await db.collection('users').limit(200).get();
    const entries = snap.docs
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

    return NextResponse.json({ entries });
  } catch (err) {
    console.error('[public/leaderboard] Error:', err);
    return NextResponse.json({ entries: [] });
  }
}
