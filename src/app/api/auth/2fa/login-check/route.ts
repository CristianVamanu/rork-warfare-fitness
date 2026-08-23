export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, twoFactorCodeEmailHtml } from '@/lib/email';

const CODE_TTL_MS = 10 * 60 * 1000;

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
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
    if (!user?.twoFactorEnabled) return NextResponse.json({ required: false });

    if (deviceId && token) {
      const deviceSnap = await db.collection('trustedDevices').doc(uid).collection('devices').doc(deviceId).get();
      const device = deviceSnap.data();
      const expiresAtMs = (device?.expiresAt?.toMillis?.() as number | undefined) ?? 0;
      if (device && device.tokenHash === hashToken(token) && expiresAtMs > Date.now()) {
        return NextResponse.json({ required: false });
      }
    }

    if (!user.email) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

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
      to: user.email,
      subject: `Your ${appName} sign-in code`,
      html: twoFactorCodeEmailHtml(code, appName),
    });

    return NextResponse.json({ required: true });
  } catch (err) {
    console.error('[auth/2fa/login-check] Error:', err);
    return NextResponse.json({ error: 'Failed to check 2FA status' }, { status: 500 });
  }
}
