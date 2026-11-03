export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { buildReport, type Member, type Activity } from '@/lib/retention';

/**
 * GET — retention report for Admin → Retention: weekly signup cohorts with
 * day 1/7/30 retention, first workout and first week completion, paid
 * conversion, active users and program drop-off. Admin only, read-only.
 * The maths lives in lib/retention (unit-tested); this only loads data.
 */
const DAY = 86_400_000;
const WEEKS = 12;

const ms = (v: unknown): number => {
  const t = v as { toMillis?: () => number; seconds?: number } | null;
  if (t?.toMillis) return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000;
  const n = new Date(v as string).getTime();
  return Number.isNaN(n) ? 0 : n;
};

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const now = Date.now();
  // Cohorts cover 12 weeks; activity is read from the start of the oldest
  // cohort so every day-N window inside it is complete.
  const since = now - WEEKS * 7 * DAY;

  try {
    const [usersSnap, eventsSnap] = await Promise.all([
      db.collection('users').select('createdAt', 'role', 'membership', 'activeProgram').get(),
      db.collection('events').where('createdAt', '>=', new Date(since)).select('userId', 'type', 'createdAt').limit(80_000).get(),
    ]);

    const members: Member[] = [];
    for (const d of usersSnap.docs) {
      const u = d.data() as Record<string, unknown>;
      if (u.role === 'admin' || u.role === 'trainer') continue; // staff are not members
      const signedUpAt = ms(u.createdAt);
      if (!signedUpAt) continue;
      const mem = u.membership as { stripeSubscriptionId?: string } | undefined;
      const ap = u.activeProgram as { programId?: string; programName?: string; completedWorkouts?: number; totalWorkouts?: number } | undefined;
      members.push({
        uid: d.id, signedUpAt, paid: !!mem?.stripeSubscriptionId,
        programId: ap?.programId, programName: ap?.programName,
        completedWorkouts: Number(ap?.completedWorkouts ?? 0), totalWorkouts: Number(ap?.totalWorkouts ?? 0),
      });
    }
    const memberIds = new Set(members.map((m) => m.uid));
    const activity: Activity[] = [];
    for (const d of eventsSnap.docs) {
      const e = d.data() as { userId?: string; type?: string; createdAt?: unknown };
      if (!e.userId || !memberIds.has(e.userId)) continue;
      activity.push({ uid: e.userId, at: ms(e.createdAt), type: String(e.type ?? '') });
    }

    const report = buildReport(members, activity, now, WEEKS);
    return NextResponse.json({ ...report, truncated: eventsSnap.size >= 80_000 });
  } catch (err) {
    console.error('[admin/retention]', err);
    return NextResponse.json({ error: (err as Error).message || 'Failed to build the report' }, { status: 500 });
  }
}
