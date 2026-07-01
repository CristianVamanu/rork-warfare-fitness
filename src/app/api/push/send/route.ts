export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app);
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
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, title, body } = await req.json() as { userId?: string; title: string; body: string };

  if (!(await initWebPush())) return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  let docs;
  if (userId) {
    const docSnap = await db.collection('pushSubscriptions').doc(userId).get();
    docs = docSnap.exists ? [docSnap] : [];
  } else {
    const col = await db.collection('pushSubscriptions').get();
    docs = col.docs;
  }

  const payload = JSON.stringify({ title, body });
  const results = await Promise.allSettled(
    docs.map(async (d) => {
      const sub = d.data()?.subscription;
      if (!sub) return;
      await webpush.sendNotification(sub, payload);
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return NextResponse.json({ sent, failed });
}
