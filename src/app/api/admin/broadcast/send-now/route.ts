export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start a queued broadcast immediately.
 *
 * Queueing alone meant the admin pressed Send and nothing happened until
 * the top of the hour, which reads as broken. This runs the first batch
 * inside the request, with a budget that fits under the proxy's 100-second
 * cut-off, and the hourly cron continues from the same cursor if the list
 * was too long to finish here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { unsubscribeSecret } from '@/lib/emailUnsubscribe';
import { runBroadcasts } from '@/lib/broadcastSender';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Broadcast id required' }, { status: 400 });

  const unsubSecret = unsubscribeSecret();
  if (!unsubSecret) return NextResponse.json({ error: 'ENCRYPTION_KEY or CRON_SECRET is not set on the server, so marketing email cannot be signed' }, { status: 503 });

  const db = getAdminDb(app);
  const cfg = (await db.doc('system/config').get()).data() ?? {};
  const brand = { name: (cfg.appName as string) || 'Warfare Fitness', logoUrl: (cfg.logoUrl as string) || null };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';

  try {
    const r = await runBroadcasts({ db, brand, appUrl, unsubSecret, budgetMs: 75_000, onlyId: id });
    if (r.reason === 'not-found') return NextResponse.json({ error: 'That broadcast no longer exists' }, { status: 404 });
    if (r.reason === 'already-done') return NextResponse.json({ error: 'That broadcast has already been sent' }, { status: 409 });
    if (r.reason === 'busy') return NextResponse.json({ error: 'It is already sending. Check back in a minute.' }, { status: 409 });
    return NextResponse.json({ ok: true, sent: r.sent, finished: r.finished });
  } catch (err) {
    console.error('[admin/broadcast/send-now]', err);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
