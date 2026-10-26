export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';

/**
 * "New challenge live" — a push to every device, once per challenge.
 * Called by the admin panel when a challenge is set live. announcedAt on
 * the challenge stops a second Set live (draft → live → closed → live)
 * from pushing everyone again.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json().catch(() => null) as { challengeId?: string } | null;
  if (!body?.challengeId) return NextResponse.json({ error: 'challengeId required' }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const ref = db.collection('challenges').doc(body.challengeId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  const c = snap.data()!;
  if (c.status !== 'live') return NextResponse.json({ error: 'Challenge is not live' }, { status: 400 });
  if (c.announcedAt) return NextResponse.json({ ok: true, sent: 0, alreadyAnnounced: true });

  await ref.update({ announcedAt: FieldValue.serverTimestamp() });
  if (!(await initWebPush().catch(() => false))) return NextResponse.json({ ok: true, sent: 0, push: 'not configured' });

  const brief = String(c.brief ?? '').slice(0, 140);
  const result = await sendPushToUsers(db, null, {
    title: `New challenge: ${String(c.title ?? '')}`,
    body: brief || 'Enter now. Prove it.',
    url: `/community/challenges/${body.challengeId}`,
  });
  return NextResponse.json({ ok: true, ...result });
}
