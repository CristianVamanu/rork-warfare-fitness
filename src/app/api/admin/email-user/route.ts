export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One email from the admin to one member, from the Clients tab.
 *
 * A direct message, not marketing: it is the admin writing to a named
 * person the way support does, so it does not carry the marketing
 * unsubscribe and is not blocked by the marketing opt-out. It is logged
 * like everything else, so "did we email this person, and what" has an
 * answer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, directEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const { userId, subject, body } = await req.json().catch(() => ({})) as { userId?: string; subject?: string; body?: string };
  const s = (subject ?? '').trim();
  const b = (body ?? '').trim();
  if (!userId || !s || !b) return NextResponse.json({ error: 'userId, subject and body are required' }, { status: 400 });
  if (s.length > 200 || b.length > 5000) return NextResponse.json({ error: 'Subject max 200 characters, body max 5000' }, { status: 400 });

  try {
    const db = getAdminDb(app);
    const [userSnap, cfgSnap] = await Promise.all([db.collection('users').doc(userId).get(), db.doc('system/config').get()]);
    const email = userSnap.data()?.email as string | undefined;
    if (!userSnap.exists || !email) return NextResponse.json({ error: 'That member has no email address' }, { status: 404 });

    const cfg = cfgSnap.data() ?? {};
    const brand = { name: (cfg.appName as string) || 'Warfare Fitness', logoUrl: (cfg.logoUrl as string) || null };
    const ok = await sendEmail({
      to: email,
      subject: s,
      html: directEmailHtml({ brand, paragraphs: b.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean), name: (userSnap.data()?.displayName as string | undefined)?.split(' ')[0] }),
    });
    if (!ok) return NextResponse.json({ error: 'The email service refused the send' }, { status: 502 });

    await db.collection('emailLog').add({ at: FieldValue.serverTimestamp(), kind: 'direct', to: email, uid: userId, by: check.uid, subject: s });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/email-user]', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
