export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';

/**
 * A member submitted a challenge result: tell the admins.
 *
 * Verifying is a human step, and nothing used to prompt the human. The
 * submission sat in the review list until someone happened to open Admin →
 * Challenges. This writes one notification per admin and a push, with the
 * member's name and result, linking straight to the review screen.
 *
 * The caller only names the challenge; the entry is looked up under the
 * caller's own uid and must actually be in 'submitted' state, so this
 * cannot be used to spam admins about nothing. One notification per
 * submission: a resubmission after a rejection notifies again, a repeated
 * call for the same submission does not.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const body = await req.json().catch(() => null) as { challengeId?: string } | null;
  const challengeId = body?.challengeId;
  if (!challengeId) return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });

  try {
    const db = getAdminDb(app);
    const chRef = db.collection('challenges').doc(challengeId);
    const entryRef = chRef.collection('entries').doc(check.uid);
    const [ch, entry] = await Promise.all([chRef.get(), entryRef.get()]);
    if (!ch.exists || !entry.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const e = entry.data()!;
    if (e.status !== 'submitted') return NextResponse.json({ ok: true, notified: 0, reason: 'not-submitted' });

    const submittedAt = (e.submittedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const notifiedAt = (e.adminNotifiedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    if (notifiedAt && notifiedAt >= submittedAt) return NextResponse.json({ ok: true, notified: 0, reason: 'already' });

    const admins = await db.collection('users').where('role', '==', 'admin').limit(20).get();
    const adminIds = admins.docs.map((d) => d.id).filter((id) => id !== check.uid);
    const title = String(ch.data()?.title ?? 'Challenge');
    const who = String(e.displayName ?? 'A member');
    const text = `${who} submitted ${e.result ? `"${e.result}"` : 'a result'} for ${title}. Review it.`;
    const url = '/admin/challenges';

    const batch = db.batch();
    for (const id of adminIds) {
      batch.set(db.collection('notifications').doc(), {
        userId: id,
        type: 'challenge_submitted',
        title: `${title}: result to review`,
        body: text,
        actionLabel: 'Review',
        actionUrl: url,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    batch.update(entryRef, { adminNotifiedAt: FieldValue.serverTimestamp() });
    await batch.commit();

    if (adminIds.length && await initWebPush().catch(() => false)) {
      await sendPushToUsers(db, adminIds, { title: `${title}: result to review`, body: text, url }).catch(() => {});
    }
    return NextResponse.json({ ok: true, notified: adminIds.length });
  } catch (err) {
    console.error('[challenges/submitted] failed:', err);
    return NextResponse.json({ error: 'Could not notify' }, { status: 500 });
  }
}
