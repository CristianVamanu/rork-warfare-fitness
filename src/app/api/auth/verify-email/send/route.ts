export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issues a 6-digit email-confirmation code.
 *
 * The link-based flow it replaces has one structural problem: the link opens
 * in the member's DEFAULT BROWSER, not the PWA they signed up in. That's a
 * different session, so the app they're actually looking at never learns the
 * address was confirmed — which is where "the link opens the site but nothing
 * happens" comes from. A code never leaves the app.
 *
 * Mirrors the 2FA code flow (see api/auth/2fa/login-check): random 6 digits,
 * only the SHA-256 hash stored, short TTL, bounded attempts on the verify
 * side. Authed — the caller is signed in but unverified, which is exactly the
 * state this exists to resolve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { issueVerificationCode } from '@/lib/verificationCode';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const auth = getAuth(app);
    const user = await auth.getUser(uid);

    // Already done — say so rather than mailing a code for a state that no
    // longer exists. The client uses this to unstick itself.
    if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

    const email = user.email;
    if (!email) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

    // Keyed on uid rather than IP: this route is authenticated, so the
    // account is the thing worth bounding, and one person behind a shared
    // NAT shouldn't be able to lock out another.
    const limit = await rateLimit({ scope: 'verify-email-send', key: uid, windowMs: 15 * 60_000, max: 6 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many codes requested', retryAfter: limit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const sent = await issueVerificationCode(db, uid, email);
    if (!sent) {
      // Resend unconfigured or refusing. Say so plainly instead of leaving
      // the member staring at a code entry box no code will ever arrive for.
      return NextResponse.json({ error: 'Could not send the email. Please try again shortly.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[verify-email/send] Error:', err);
    return NextResponse.json({ error: 'Could not send the code' }, { status: 500 });
  }
}
