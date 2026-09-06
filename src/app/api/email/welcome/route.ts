export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, welcomeEmailHtml } from '@/lib/email';
import { rateLimit } from '@/lib/rateLimit';

// Same reasoning/pattern as email/achievement's throttle — an authenticated
// route with no other rate limit could otherwise be looped to run up real
// email-provider billing.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const limited = await rateLimit({ scope: 'welcome-email', key: check.uid, windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, reason: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
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
      subject: `Welcome to ${appName} 💪`,
      html: welcomeEmailHtml(user.displayName?.split(' ')[0] || 'there', appName, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/welcome] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
