export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Checks a 6-digit code and, on success, marks the address verified.
 *
 * Firebase only sets emailVerified from its own action link or the Admin SDK.
 * This is the Admin SDK half, which is what lets the whole confirmation
 * happen inside the app instead of bouncing through a browser.
 *
 * Same defences as api/auth/2fa/verify: hash comparison, expiry, and a hard
 * attempt cap so six digits can't be walked.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

const MAX_ATTEMPTS = 5;

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const { code } = await req.json().catch(() => ({})) as { code?: string };
    const submitted = typeof code === 'string' ? code.trim() : '';
    if (!/^\d{6}$/.test(submitted)) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your email' }, { status: 400 });
    }

    const auth = getAuth(app);
    const user = await auth.getUser(uid);
    if (user.emailVerified) return NextResponse.json({ ok: true });

    const ref = db.collection('emailVerifyCodes').doc(uid);
    const snap = await ref.get();
    const stored = snap.data();
    if (!stored) {
      return NextResponse.json({ error: 'No code pending — request a new one' }, { status: 400 });
    }

    const expiresAtMs = (stored.expiresAt?.toMillis?.() as number | undefined) ?? 0;
    if (expiresAtMs < Date.now()) {
      await ref.delete();
      return NextResponse.json({ error: 'That code expired — request a new one' }, { status: 400 });
    }
    if ((stored.attempts ?? 0) >= MAX_ATTEMPTS) {
      await ref.delete();
      return NextResponse.json({ error: 'Too many attempts — request a new code' }, { status: 429 });
    }
    // The code was minted for the address on the account at the time. If the
    // address has changed since, confirming it would verify the wrong one.
    if (stored.email && stored.email !== user.email) {
      await ref.delete();
      return NextResponse.json({ error: 'Your email changed — request a new code' }, { status: 400 });
    }

    if (stored.codeHash !== hashToken(submitted)) {
      await ref.update({ attempts: FieldValue.increment(1) });
      const left = MAX_ATTEMPTS - ((stored.attempts ?? 0) + 1);
      return NextResponse.json(
        { error: left > 0 ? `Incorrect code — ${left} attempt${left === 1 ? '' : 's'} left` : 'Incorrect code' },
        { status: 400 }
      );
    }

    await auth.updateUser(uid, { emailVerified: true });
    await ref.delete();

    // emailVerified lives on the ID token, so the client must call
    // getIdToken(true) after this or every server gate keeps reading the
    // stale value. Flagged in the response so the caller can't forget.
    return NextResponse.json({ ok: true, refreshToken: true });
  } catch (err) {
    console.error('[verify-email/confirm] Error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
