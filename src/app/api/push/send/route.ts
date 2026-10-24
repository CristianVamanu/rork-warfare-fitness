export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';
import { timingSafeEqualString } from '@/lib/crypto';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
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

  const { userId, title, body, url } = await req.json() as { userId?: string; title: string; body: string; url?: string };

  if (!(await initWebPush())) return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const result = await sendPushToUsers(db, userId ? [userId] : null, { title, body, url });
  return NextResponse.json(result);
}
