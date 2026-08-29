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

    // From here on a code is genuinely required. setTfaPendingClaim(true) is
    // deliberately the LAST thing this route does, not the first — it used
    // to run here, before the email/Firestore writes below, so ANY failure
    // in between (a missing recipient email, a transient Firestore write
    // error, an email-send exception) left the claim set to pending with a
    // non-2xx response going back to the client. LoginClient's own 2FA
    // check deliberately "fails open" on a non-ok response (so a real 2FA
    // outage doesn't lock someone out of their own account) — which meant
    // exactly that failure mode instead silently sent the user straight to
    // /dashboard while every Firestore read they made from then on got
    // refused by notTfaPending(), with no code ever having been sent and no
    // way to see why. Doing every operation that can fail FIRST, and only
    // marking the account pending once a code has actually been generated,
    // stored, and (best-effort) emailed, means a failure anywhere above
    // returns an error response with the claim never having been touched —
    // the account stays exactly as accessible as it was before this call.
    const recipient = (user.twoFactorEmail as string | undefined) || user.email;
    if (!recipient) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

    const code = crypto.randomInt(100000, 1000000).toString();
    await db.collection('twoFactorCodes').doc(uid).set({
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
    });
    await db.collection('users').doc(uid).update({ twoFactorPendingSince: FieldValue.serverTimestamp() });

    const cfgSnap = await db.collection('system').doc('config').get();
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    await sendEmail({
      to: recipient,
      subject: `Your ${appName} sign-in code`,
      html: twoFactorCodeEmailHtml(code, appName),
    });

    await setTfaPendingClaim(app, uid, true);
    return NextResponse.json({ required: true });
  } catch (err) {
    console.error('[auth/2fa/login-check] Error:', err);
    return NextResponse.json({ error: 'Failed to check 2FA status' }, { status: 500 });
  }
}
