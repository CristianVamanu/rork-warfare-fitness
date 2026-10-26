export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { code, programId? } — credits a referral once, right after a new
 * account is created during onboarding.
 *
 * The new member's uid comes from their own verified ID token, never from
 * the request body — the caller can only ever credit a join to THEMSELVES
 * as the joiner. Who gets the credit is resolved server-side from `code`,
 * so nothing in the request lets a caller name an arbitrary account as the
 * referrer either.
 *
 * Idempotent by construction: the join document's id is the joining
 * member's own uid, under the referrer's subcollection. Calling this
 * twice for the same new member overwrites the same document rather than
 * creating a second one, so a retried request (or a signup flow that
 * fires this more than once) cannot inflate a referrer's count.
 *
 * Self-referral (an account crediting its own code) is a deliberate no-op
 * rather than an error — the caller's UI does not need to distinguish
 * "this failed" from "this doesn't count", and it costs nothing to block
 * the cheapest version of gaming this without chasing every version, which
 * was the agreed trade-off going in (see referral.ts / this feature's
 * design conversation): no reward is attached to a referral count, so a
 * determined person could still inflate it with alt accounts, and that is
 * accepted rather than engineered against.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { isValidReferralCode } from '@/lib/referral';

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const body = await req.json().catch(() => ({})) as { code?: string; programId?: string };
  if (!isValidReferralCode(body.code)) {
    // Not an error the caller needs to act on — an invalid or missing code
    // means "this signup didn't come from a share link", which is the
    // ordinary case for almost everyone. 200/ok keeps onboarding's
    // fire-and-forget call simple: it never has to branch on this.
    return NextResponse.json({ ok: true, credited: false });
  }

  try {
    const codeSnap = await db.collection('referralCodes').doc(body.code).get();
    const referrerUid = codeSnap.data()?.uid as string | undefined;
    if (!referrerUid || referrerUid === check.uid) {
      return NextResponse.json({ ok: true, credited: false });
    }

    await db
      .collection('referralJoins').doc(referrerUid)
      .collection('members').doc(check.uid)
      .set({
        joinedAt: new Date(),
        programId: typeof body.programId === 'string' ? body.programId.slice(0, 100) : null,
      }, { merge: true });

    return NextResponse.json({ ok: true, credited: true });
  } catch (err) {
    console.error('[referral/join] Error:', err);
    // Never block onboarding on this — a missed credit is a lost vanity
    // number, not a lost account.
    return NextResponse.json({ ok: true, credited: false });
  }
}
