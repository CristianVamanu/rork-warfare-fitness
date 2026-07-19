export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, real usage stats for the logged-out landing page's social-proof
 * strip — no auth required, no PII, and no invented numbers. Uses Firestore
 * count() aggregation queries so it costs one read regardless of collection
 * size, not a full scan.
 */

import { NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
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
    });
  } catch (err) {
    console.error('[public/stats] Error:', err);
    return NextResponse.json({ totalUsers: 0, totalWorkouts: 0 });
  }
}
