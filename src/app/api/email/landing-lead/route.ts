export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, landingLeadFollowupEmailHtml } from '@/lib/email';
import { getSystemConfig } from '@/lib/firestore';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { verifyTurnstile } from '@/lib/turnstile';

// Fulfills the exit-intent popup's promise ("we'll send you a link to jump
// back in") — createLandingLead() only writes the Firestore lead doc, it
// never sends anything itself. Deliberately unauthenticated, same reasoning
// as email/trainer-lead: the visitor hasn't signed up yet, there's no token
// to verify. The lead itself is already shape-checked by firestore.rules;
// this route is a best-effort follow-up email, so a failure here never
// blocks the popup from showing its "you're all set" confirmation.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const limited = await rateLimit({ scope: 'landing-lead', key: ip, windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, reason: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }


    const body = await req.json() as { email?: string; turnstileToken?: string };
    if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) {
      return NextResponse.json({ ok: false, reason: 'Invalid email' }, { status: 400 });
    }

    // Bot check. Inert until TURNSTILE_SECRET_KEY is set, so this is safe to
    // ship before the keys exist. The IP limiter above is only a speed bump —
    // x-forwarded-for is attacker-controlled without a trusted proxy.
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return NextResponse.json({ ok: false, reason: 'Failed bot check' }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const cfg = await getSystemConfig().catch(() => null);
    const appName = (cfg?.appName as string) || 'Warfare Fitness';

    const sent = await sendEmail({
      to: body.email,
      subject: `Pick up where you left off on ${appName}`,
      html: landingLeadFollowupEmailHtml(appName, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/landing-lead] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
