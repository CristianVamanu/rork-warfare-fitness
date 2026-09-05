export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends verification and password-reset mail from THIS app's domain.
 *
 * Firebase Auth will happily send both itself, but it sends them from
 * noreply@<project>.firebaseapp.com — a domain with no SPF/DKIM alignment to
 * the app's own sending domain and no reputation attached to it, which is why
 * those messages land in spam. That matters more than it sounds: email
 * verification gates trial access (see MembershipGuard and
 * verifyFeatureAccess), so a verification mail in the spam folder is a new
 * signup who cannot reach the product they just signed up for.
 *
 * The Admin SDK mints the same action link Firebase would have emailed, and
 * Resend delivers it from RESEND_FROM_EMAIL instead. The link itself is
 * identical in kind to Firebase's own, so the /__/auth/action handler and all
 * of Firebase's expiry and single-use rules still apply unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, verifyEmailHtml, passwordResetEmailHtml } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

type Kind = 'verify' | 'reset';

export async function POST(req: NextRequest) {
  try {
    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    const { email, kind } = (await req.json()) as { email?: string; kind?: Kind };
    if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (kind !== 'verify' && kind !== 'reset') {
      return NextResponse.json({ error: 'Unknown email kind' }, { status: 400 });
    }

    // Unauthenticated by necessity — a password reset is requested by someone
    // who cannot sign in, and verification is re-requested by an account whose
    // token is valid but unverified. So it's rate limited on both axes: per
    // address, so one inbox can't be flooded, and per IP, so one client can't
    // walk a list of addresses to find out which ones have accounts.
    // 5-per-15-min was too tight in practice: a signup spends one, and
    // someone who thinks the first mail didn't arrive spends the rest in
    // under a minute — leaving them locked out of the one action that
    // unblocks them. 10 still bounds inbox flooding, and the response now
    // carries retryAfter so the UI can say how long rather than dead-ending.
    const addressLimit = await rateLimit({
      scope: 'auth-email-address', key: `${kind}:${email.toLowerCase()}`, windowMs: 15 * 60_000, max: 10,
    });
    const ipLimit = await rateLimit({
      scope: 'auth-email-ip', key: clientIp(req), windowMs: 15 * 60_000, max: 30,
    });
    if (!addressLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(addressLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
      return NextResponse.json(
        { error: 'Too many requests', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const cfgSnap = await getAdminDb(app).collection('system').doc('config').get().catch(() => null);
    const appName = (cfgSnap?.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const auth = getAuth(app);

    // Deliberately generic on every outcome below, including "no such
    // account": a differing response would turn this into an oracle for
    // which addresses are registered.
    let link: string;
    let html: string;
    let subject: string;
    try {
      if (kind === 'verify') {
        // Lands on /login, not /dashboard. The link is almost always opened
        // in the default browser rather than the PWA the member signed up in,
        // and that browser has no session — so /dashboard silently bounced to
        // /login with no explanation, which reads as "the link did nothing".
        // ?verified=1 lets the login page say what actually happened.
        link = await auth.generateEmailVerificationLink(email, { url: `${appUrl}/login?verified=1` });
        const user = await auth.getUserByEmail(email).catch(() => null);
        const firstName = user?.displayName?.split(' ')[0] || 'there';
        html = verifyEmailHtml(firstName, link, appName);
        subject = `Confirm your email — ${appName}`;
      } else {
        link = await auth.generatePasswordResetLink(email, { url: `${appUrl}/login` });
        html = passwordResetEmailHtml(link, appName);
        subject = `Reset your password — ${appName}`;
      }
    } catch (err) {
      // The RESPONSE stays generic — differing output here would turn this
      // route into an oracle for which addresses have accounts. The LOG must
      // not be generic though: this catch swallowed everything silently,
      // including real misconfiguration, and left nothing behind to debug
      // with. auth/user-not-found is the ordinary case and stays quiet.
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/user-not-found') {
        console.error(`[send-auth-email] could not mint ${kind} link:`, code ?? err);
      }
      // Same body as the success path. Returning `{ok:true}` here and
      // `{ok:true, delivered}` below told a caller whether an address had an
      // account — and the client then fell back to Firebase's own sender,
      // whose auth/user-not-found made the oracle louder still. Claiming
      // delivery for an unknown address is the standard "if an account
      // exists, we've emailed it" behaviour.
      return NextResponse.json({ ok: true, delivered: true });
    }

    const sent = await sendEmail({ to: email, subject, html });
    // `sent` is false when RESEND_API_KEY isn't configured. Reported so the
    // client can fall back to Firebase's own sender rather than leaving the
    // member with no email at all on an install that never set Resend up.
    return NextResponse.json({ ok: true, delivered: sent });
  } catch (err) {
    console.error('[send-auth-email] failed:', err);
    return NextResponse.json({ error: 'Could not send the email' }, { status: 500 });
  }
}
