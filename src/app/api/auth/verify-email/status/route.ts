export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is there already a live confirmation code for this account?
 *
 * Without this the app could not tell. `codeSent` was component state, so a
 * code issued on the SERVER — which is what change-email does, before signing
 * the member out — was invisible to the next session. Two consequences, both
 * seen in production:
 *
 *  - The banner offered only "Send code" and no box to type into, so someone
 *    holding a perfectly good code from their inbox had nowhere to put it.
 *  - The full-screen gate auto-sent on mount, and because issuing a code
 *    OVERWRITES the stored one, it silently invalidated the code the member
 *    had just been mailed. They typed it and were told it was wrong.
 *
 * Returns only whether a code exists and when it dies — never the code, never
 * its hash. Knowing that a code is outstanding tells an attacker nothing they
 * could not learn by pressing the button themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  try {
    const user = await getAuth(app).getUser(uid);
    if (user.emailVerified) {
      return NextResponse.json({ alreadyVerified: true, pending: false, expiresAt: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const snap = await getAdminDb(app).collection('emailVerifyCodes').doc(uid).get();
    const expires = snap.data()?.expiresAt as { toMillis?: () => number } | undefined;
    const expiresAt = typeof expires?.toMillis === 'function' ? expires.toMillis() : null;
    // An expired document is the same as none: the confirm route would refuse
    // it anyway, and reporting it as pending would show a countdown at 00:00.
    const pending = expiresAt !== null && expiresAt > Date.now();

    return NextResponse.json(
      { alreadyVerified: false, pending, expiresAt: pending ? expiresAt : null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[verify-email/status] Error:', err);
    // A failure here must not block confirmation — the client falls back to
    // the old behaviour (offer to send one) rather than showing nothing.
    return NextResponse.json({ error: 'Could not read verification status' }, { status: 500 });
  }
}
