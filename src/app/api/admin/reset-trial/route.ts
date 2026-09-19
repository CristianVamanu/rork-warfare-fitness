export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clears a user's `trialUsedAt` so they become eligible for a trial again.
 *
 * `trialUsedAt` is what stops cancel-and-resubscribe farming a fresh trial
 * every cycle (see plan-checkout's alreadyUsedTrial), so it is deliberately
 * one-way and set by the webhook rather than by anything a member controls.
 * But it had no reset at all, which made two ordinary situations impossible:
 * testing your own funnel more than once, and giving a trial back to someone
 * with a legitimate reason — a signup that broke halfway, a charge that got
 * refunded, a member who was never actually given the trial they used up.
 *
 * Admin-only, and the audit trail matters more here than in most places:
 * this hands out something that is otherwise once-per-account, so who did it
 * and when is recorded on the user document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId } = await req.json().catch(() => ({})) as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const db = getAdminDb(app);
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) return NextResponse.json({ error: 'No such user' }, { status: 404 });

    if (!snap.data()?.trialUsedAt) {
      // Already eligible — say so rather than reporting a no-op as success,
      // so an admin who expected this to fix something looks elsewhere.
      return NextResponse.json({ ok: true, alreadyEligible: true });
    }

    await userRef.update({
      trialUsedAt: FieldValue.delete(),
      trialResetAt: FieldValue.serverTimestamp(),
      trialResetBy: check.uid,
    });

    console.log(`[admin/reset-trial] ${check.uid} reset trial eligibility for ${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/reset-trial] Error:', err);
    return NextResponse.json({ error: 'Could not reset trial eligibility' }, { status: 500 });
  }
}
