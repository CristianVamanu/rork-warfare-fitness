export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';

/**
 * A push an admin sends from the browser, on the back of something they just
 * did: a goal set, a nutrition plan assigned, a manual notification, a
 * broadcast. Authenticated by the admin's own ID token, so it is separate
 * from /api/push/send, which the hourly cron authenticates with a secret
 * that must never reach a browser.
 *
 * One user, several users, or everyone (userIds omitted) — the fan-out
 * happens here, not as five thousand requests from a browser tab.
 */
const MAX_RECIPIENTS = 5000;

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json().catch(() => null) as { userId?: string; userIds?: string[]; title?: string; body?: string; url?: string } | null;
  const title = body?.title?.toString().slice(0, 120);
  const text = body?.body?.toString().slice(0, 500);
  if (!title || !text) return NextResponse.json({ error: 'title and body are required' }, { status: 400 });

  let recipients: string[] | null;
  if (Array.isArray(body?.userIds)) recipients = body!.userIds!.filter((u) => typeof u === 'string').slice(0, MAX_RECIPIENTS);
  else if (typeof body?.userId === 'string') recipients = [body.userId];
  else recipients = null;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  if (!(await initWebPush())) return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });

  const url = typeof body?.url === 'string' && body.url.startsWith('/') ? body.url : undefined;
  const result = await sendPushToUsers(getAdminDb(app), recipients, { title, body: text, url });
  return NextResponse.json(result);
}
