export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, achievementEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const { titles } = await req.json() as { titles: string[] };
    if (!Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json({ error: 'titles is required' }, { status: 400 });
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    const db = getAdminDb(app);

    const userSnap = await db.collection('users').doc(check.uid).get();
    const user = userSnap.data();
    if (!user?.email) return NextResponse.json({ ok: false, reason: 'No email on file' });

    const cfgSnap = await db.collection('system').doc('config').get();
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';

    const sent = await sendEmail({
      to: user.email,
      subject: titles.length > 1 ? `You unlocked ${titles.length} new achievements! 🏆` : `You unlocked "${titles[0]}"! 🏆`,
      html: achievementEmailHtml(user.displayName?.split(' ')[0] || 'there', titles, appName, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/achievement] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
