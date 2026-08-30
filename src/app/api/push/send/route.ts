export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';
import { timingSafeEqualString } from '@/lib/crypto';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

async function initWebPush() {
  const [pub, priv] = await Promise.all([
    getSecret('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    getSecret('VAPID_PRIVATE_KEY'),
  ]);
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@warfarefitness.com'),
    pub,
    priv,
  );
  return true;
}

export async function POST(req: NextRequest) {
  // Fail closed if CRON_SECRET isn't configured — the previous check
  // compared against `Bearer ${undefined}`, which a literal
  // "Authorization: Bearer undefined" header satisfies, letting anyone
  // trigger a push send to any user with no real secret set at all.
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!timingSafeEqualString(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, title, body } = await req.json() as { userId?: string; title: string; body: string };

  if (!(await initWebPush())) return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  // One device doc per registered browser/device at
  // pushSubscriptions/{userId}/devices/{deviceId} — a user with
  // notifications enabled on more than one device gets sent to all of them.
  let docs;
  if (userId) {
    const devicesSnap = await db.collection('pushSubscriptions').doc(userId).collection('devices').get();
    docs = devicesSnap.docs;
  } else {
    const devicesSnap = await db.collectionGroup('devices').get();
    docs = devicesSnap.docs.filter((d) => d.ref.parent.parent?.parent.id === 'pushSubscriptions');
  }

  const payload = JSON.stringify({ title, body });
  const results = await Promise.allSettled(
    docs.map(async (d) => {
      const sub = d.data()?.subscription;
      if (!sub) return;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        // 404/410 means the browser/OS has permanently revoked this
        // subscription (uninstalled PWA, cleared permissions, etc.) —
        // every future send would fail identically forever, so the doc is
        // dead weight. Deleting it here is the only place this ever gets
        // cleaned up; nothing else in the app prunes stale subscriptions.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await d.ref.delete().catch(() => {});
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(`[push/send] ${failed} of ${docs.length} notifications failed:`,
      results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message ?? r));
  }
  return NextResponse.json({ sent, failed });
}
