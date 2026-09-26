export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, landingLeadFollowupEmailHtml } from '@/lib/email';
import { getSystemConfig } from '@/lib/firestore';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

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

    // Turnstile verification REMOVED — deliberately, do not re-add without
    // building the widget first.
    //
    // The server expected a `turnstileToken` in this body and no client ever
    // sent one, because the widget was never built. So the check passed only
    // because TURNSTILE_SECRET_KEY is unset: setting that key — the one
    // action that looks like 'turning on bot protection' — would have made
    // this 403 every genuine submission on the form, with no obvious cause.
    // A security control that provides nothing until configured and breaks
    // the page the moment it is configured is worse than none.
    //
    // Re-enabling it is a real piece of work, not a config flag: a client
    // widget, the Cloudflare script under a CSP that uses strict-dynamic (so
    // it must be nonced, not host-allowlisted), and frame-src for the
    // challenge iframe. The IP rate limit above is the actual protection
    // this form has today.

    // Only for an address that just left its email on the landing page. The
    // popup writes the lead (createLandingLead) and then calls this, so a
    // lead row from the last few minutes is what a real submission looks
    // like. Without this check the route mailed any address posted to it,
    // which made it a relay for spam under our sending domain.
    const app = getAdminApp();
    if (app) {
      // Equality on email only, recency checked in memory: an equality plus
      // a range on another field would need a composite index, and a query
      // that fails for want of one would silently skip this gate.
      const raw = body.email.trim();
      const candidates = Array.from(new Set([raw, raw.toLowerCase()]));
      const sinceMs = Date.now() - 10 * 60_000;
      const snap = await getAdminDb(app).collection('landingLeads')
        .where('email', 'in', candidates)
        .limit(10)
        .get()
        .catch(() => null);
      const recent = snap?.docs.some((d) => {
        const at = d.data().createdAt as { toMillis?: () => number } | undefined;
        return typeof at?.toMillis === 'function' && at.toMillis() >= sinceMs;
      });
      if (snap && !recent) {
        return NextResponse.json({ ok: false, reason: 'No matching signup' }, { status: 404 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const cfg = await getSystemConfig().catch(() => null);
    const appName = (cfg?.appName as string) || 'Warfare Fitness';
    // logoUrl lives in the same config document appName came from, so the
    // email header gets the real logo for no extra read.
    const brand = { name: appName, logoUrl: (cfg?.logoUrl as string) || null };

    const sent = await sendEmail({
      to: body.email,
      subject: `Pick up where you left off on ${appName}`,
      html: landingLeadFollowupEmailHtml(brand, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/landing-lead] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
