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

    // The VAPID PUBLIC key is public by definition — the browser needs it to
    // create a push subscription. It was only ever written to system/secrets,
    // which firestore.rules correctly forbids clients from reading, while the
    // client looked for it at system/config.vapidPublicKey. Filling in the
    // Integrations field therefore configured the server and left every user
    // seeing "push notifications aren't set up yet". Mirrored here so either
    // admin screen configures the whole feature.
    if (key === 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') {
      const app = getAdminApp();
      if (app) {
        await getAdminDb(app).collection('system').doc('config')
          .set({ vapidPublicKey: trimmed }, { merge: true })
          .catch((err) => console.error('[secrets] VAPID public key mirror failed:', err));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
