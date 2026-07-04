export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { listSecretStatuses, setSecret, SECRET_KEYS, type SecretKey } from '@/lib/secrets';

export async function GET(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const statuses = await listSecretStatuses();
    return NextResponse.json({ secrets: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const { key, value } = await req.json();
    if (!SECRET_KEYS.includes(key as SecretKey)) {
      return NextResponse.json({ error: 'Unknown secret key' }, { status: 400 });
    }

    const trimmed = typeof value === 'string' ? value.trim() : '';
    await setSecret(key as SecretKey, trimmed);

    // VAPID public key is meant to be public — mirror it into the plain
    // system/config doc so the client push-subscribe flow can read it.
    if (key === 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') {
      const app = getAdminApp();
      if (app) {
        await getAdminDb(app).collection('system').doc('config')
          .set({ vapidPublicKey: trimmed }, { merge: true });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
