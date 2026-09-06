export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, twoFactorCodeEmailHtml } from '@/lib/email';

const CODE_TTL_MS = 10 * 60 * 1000;

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// The actual enforcement mechanism: firestore.rules' isAuthed() refuses
// every request from a token carrying tfaPending:true, regardless of how
// valid the underlying Firebase Auth session otherwise is. Before this,
// 2FA was enforced only by a client-side redirect (AppLayout checking
// twoFactorPendingSince) — a stolen password alone was enough to skip it
// entirely via a direct SDK/REST call, since Firebase Auth already grants a
// fully valid session the instant the password matches. Setting/clearing
// this claim is what actually gates real data access, not just the UI.
async function setTfaPendingClaim(app: NonNullable<ReturnType<typeof getAdminApp>>, uid: string, pending: boolean) {
  const auth = getAuth(app);
  const existing = (await auth.getUser(uid)).customClaims ?? {};
  await auth.setCustomUserClaims(uid, { ...existing, tfaPending: pending });
}

/**
 * Called right after a successful password sign-in (and again as "resend"
 * from the verify-2fa screen — both do the same thing: if 2FA isn't
 * required or this device is already trusted, say so; otherwise (re)issue
 * a fresh code). Never trust a client's own "trust me" claim without a
 * server-side deviceId + secret pair to check.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const { deviceId, token } = await req.json().catch(() => ({})) as { deviceId?: string; token?: string };

    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!user?.twoFactorEnabled) {
      // Clear defensively — e.g. an account that disabled 2FA after a
      // previous session left tfaPending:true shouldn't stay locked out.
      await setTfaPendingClaim(app, uid, false);
      return NextResponse.json({ required: false });
    }

    if (deviceId && token) {
      const deviceSnap = await db.collection('trustedDevices').doc(uid).collection('devices').doc(deviceId).get();
      const device = deviceSnap.data();
      const expiresAtMs = (device?.expiresAt?.toMillis?.() as number | undefined) ?? 0;
      if (device && device.tokenHash === hashToken(token) && expiresAtMs > Date.now()) {
        await setTfaPendingClaim(app, uid, false);
        return NextResponse.json({ required: false });
      }
    }

    // From here on a code is genuinely required. See the note above
    // setTfaPendingClaim below for why the claim is set where it is —
    // the ordering of these three steps is load-bearing in both directions.
    const recipient = (user.twoFactorEmail as string | undefined) || user.email;
    if (!recipient) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

    const code = crypto.randomInt(100000, 1000000).toString();
    await db.collection('twoFactorCodes').doc(uid).set({
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
    });
    await db.collection('users').doc(uid).update({ twoFactorPendingSince: FieldValue.serverTimestamp() });

    // Set here — after the code is safely stored, but BEFORE the email —
    // deliberately. Everything above this line can fail without stranding
    // the account (that was the original bug: the claim was set first, so a
    // later failure left it pending forever with no code ever sent, and the
    // client's fail-open path then walked into a session where every read
    // was refused). But it must NOT move below sendEmail either: the client
    // treats a non-ok response as "2FA unavailable, let them in", so a mail
    // outage with the claim unset would sign a stolen password straight into
    // the account with 2FA silently skipped. Failing CLOSED on email trouble
    // is the correct trade — the user retries or uses "Resend code".
    await setTfaPendingClaim(app, uid, true);

    const cfgSnap = await db.collection('system').doc('config').get();
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    await sendEmail({
      to: recipient,
      subject: `Your ${appName} sign-in code`,
      html: twoFactorCodeEmailHtml(code, appName),
    });

    return NextResponse.json({ required: true });
  } catch (err) {
    console.error('[auth/2fa/login-check] Error:', err);
    return NextResponse.json({ error: 'Failed to check 2FA status' }, { status: 500 });
  }
}
