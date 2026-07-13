export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, welcomeEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

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
      subject: `Welcome to ${appName} 💪`,
      html: welcomeEmailHtml(user.displayName?.split(' ')[0] || 'there', appName, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/welcome] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
