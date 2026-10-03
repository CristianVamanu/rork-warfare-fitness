export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { timingSafeEqualString } from '@/lib/crypto';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';

/**
 * Daily cron: nudge entrants who have not submitted, once, when a live
 * challenge ends within the next two days. Secured by CRON_SECRET like
 * notifications/process. Add to crontab alongside the others, e.g.
 *
 *   15 9 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     --max-time 120 http://localhost:3000/api/challenges/remind
 *
 * remindedAt on the entry is what makes it once: the window is 48h wide
 * and the job runs daily, so without it every entrant would hear twice.
 */
const WINDOW_MS = 48 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!timingSafeEqualString(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const now = Date.now();
  const live = await db.collection('challenges').where('status', '==', 'live').get();
  const pushReady = await initWebPush().catch(() => false);
  let reminded = 0;
  const touched: string[] = [];

  for (const ch of live.docs) {
    const c = ch.data();
    const end = c.endsAt?.toDate?.() as Date | undefined;
    if (!end) continue;
    const left = end.getTime() - now;
    if (left <= 0 || left > WINDOW_MS) continue;

    const entries = await ch.ref.collection('entries').where('status', '==', 'entered').get();
    const due = entries.docs.filter((e) => !e.data().remindedAt);
    if (due.length === 0) continue;
    touched.push(ch.id);

    const hours = Math.max(1, Math.round(left / 3600000));
    const title = `${c.title}: ${hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`} left`;
    const body = 'You entered. You have not submitted. Get it done and post your proof.';
    const url = `/community/challenges/${ch.id}`;

    const batch = db.batch();
    for (const e of due) {
      batch.update(e.ref, { remindedAt: FieldValue.serverTimestamp() });
      batch.set(db.collection('notifications').doc(), {
        userId: e.id, type: 'challenge_live', title, body,
        actionLabel: 'Open challenge', actionUrl: url, read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    if (pushReady) await sendPushToUsers(db, due.map((e) => e.id), { title, body, url }).catch(() => {});
    reminded += due.length;
  }

  return NextResponse.json({ ok: true, reminded, challenges: touched });
}
