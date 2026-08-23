export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

const MAX_ATTEMPTS = 5;
const REMEMBER_DEVICE_DAYS = 30;

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const { code, remember } = await req.json() as { code?: string; remember?: boolean };
    if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

    const codeRef = db.collection('twoFactorCodes').doc(uid);
    const codeSnap = await codeRef.get();
    const stored = codeSnap.data();
    if (!stored) return NextResponse.json({ error: 'No code pending — request a new one' }, { status: 400 });

    const expiresAtMs = (stored.expiresAt?.toMillis?.() as number | undefined) ?? 0;
    if (expiresAtMs < Date.now()) {
      await codeRef.delete();
      return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 });
    }
    if ((stored.attempts ?? 0) >= MAX_ATTEMPTS) {
      await codeRef.delete();
      return NextResponse.json({ error: 'Too many attempts — request a new code' }, { status: 429 });
    }

    if (stored.codeHash !== hashToken(code.trim())) {
      await codeRef.update({ attempts: FieldValue.increment(1) });
      return NextResponse.json({ error: 'Incorrect code' }, { status: 400 });
    }

    await codeRef.delete();
    await db.collection('users').doc(uid).update({ twoFactorPendingSince: FieldValue.delete() });

    if (!remember) return NextResponse.json({ ok: true });

    const deviceId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    await db.collection('trustedDevices').doc(uid).collection('devices').doc(deviceId).set({
      tokenHash: hashToken(token),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + REMEMBER_DEVICE_DAYS * 24 * 60 * 60 * 1000),
    });

    return NextResponse.json({ ok: true, deviceId, token });
  } catch (err) {
    console.error('[auth/2fa/verify] Error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
