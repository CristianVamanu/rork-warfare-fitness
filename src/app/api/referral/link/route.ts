export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — this member's own referral code and how many people have joined
 * through it. Creates the code on first call; every call after that
 * returns the same one, because a link that changes every time someone
 * asks for it cannot be shared twice.
 *
 * The code lives on `users/{uid}.referralCode`, written only here via the
 * Admin SDK — firestore.rules has no rule permitting a client to set it
 * directly, so a member cannot hand-craft or overwrite their own code (or
 * anyone else's). `referralCodes/{code}` is the reverse index that makes
 * /api/referral/join's lookup O(1) instead of a collection scan; both
 * collections are outside every match block in firestore.rules, so they
 * default-deny direct client access entirely — every read and write to
 * them goes through this route or /join.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { generateReferralCode } from '@/lib/referral';

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const userRef = db.collection('users').doc(check.uid);
    const userSnap = await userRef.get();
    let code = userSnap.data()?.referralCode as string | undefined;

    if (!code) {
      // Retried on collision rather than trusting a 7-character random
      // string never repeats. codesRef.create() (not set()) is the actual
      // uniqueness guarantee — it throws if the document already exists,
      // which a plain set() would silently overwrite.
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateReferralCode();
        const codeRef = db.collection('referralCodes').doc(candidate);
        try {
          await codeRef.create({ uid: check.uid, createdAt: new Date() });
          code = candidate;
        } catch {
          // Collision (astronomically unlikely at 34 billion combinations,
          // handled anyway because "assume it can't happen" is how it
          // eventually does) — loop and try another.
        }
      }
      if (!code) return NextResponse.json({ error: 'Could not generate a referral code. Try again.' }, { status: 500 });
      await userRef.set({ referralCode: code }, { merge: true });
    }

    // Aggregation count, not a denormalized counter on the user doc — no
    // field to keep in sync, no race between two joins landing at once,
    // and it costs one small query rather than reading every join document.
    const countSnap = await db.collection('referralJoins').doc(check.uid).collection('members').count().get();

    return NextResponse.json({ code, joinCount: countSnap.data().count });
  } catch (err) {
    console.error('[referral/link] Error:', err);
    return NextResponse.json({ error: 'Could not load your referral link' }, { status: 500 });
  }
}
