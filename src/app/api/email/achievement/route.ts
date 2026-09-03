export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, achievementEmailHtml } from '@/lib/email';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';
import { rateLimit } from '@/lib/rateLimit';

// In-memory per-uid throttle — this is an authenticated route with no other
// rate limiting, so without this any signed-in user could loop this
// endpoint to run up real email-provider billing / spam their own inbox.
// Not distributed (resets per server instance/restart), but a real floor
// against casual abuse, same pattern as the public lead-email routes.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const limited = await rateLimit({ scope: 'achievement-email', key: check.uid, windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, reason: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    // Titles are derived server-side from a fixed id -> title map rather
    // than trusted from the client — a client sending arbitrary "titles"
    // directly would let it email itself (or, if this were ever reused,
    // another target) with any text framed as a real achievement.
    const { achievementIds } = await req.json() as { achievementIds: string[] };
    if (!Array.isArray(achievementIds) || achievementIds.length === 0) {
      return NextResponse.json({ error: 'achievementIds is required' }, { status: 400 });
    }
    const titles = achievementIds
      .map((id) => ACHIEVEMENT_DEFS.find((d) => d.id === id)?.title)
      .filter((t): t is string => !!t);
    if (titles.length === 0) {
      return NextResponse.json({ ok: false, reason: 'No valid achievement ids' });
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
