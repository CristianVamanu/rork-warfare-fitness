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
    const addressLimit = await rateLimit({
      scope: 'auth-email-address', key: `${kind}:${email.toLowerCase()}`, windowMs: 15 * 60_000, max: 5,
    });
    const ipLimit = await rateLimit({
      scope: 'auth-email-ip', key: clientIp(req), windowMs: 15 * 60_000, max: 20,
    });
    if (!addressLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests — please wait a few minutes.' }, { status: 429 });
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
        link = await auth.generateEmailVerificationLink(email, { url: `${appUrl}/dashboard` });
        const user = await auth.getUserByEmail(email).catch(() => null);
        const firstName = user?.displayName?.split(' ')[0] || 'there';
        html = verifyEmailHtml(firstName, link, appName);
        subject = `Confirm your email — ${appName}`;
      } else {
        link = await auth.generatePasswordResetLink(email, { url: `${appUrl}/login` });
        html = passwordResetEmailHtml(link, appName);
        subject = `Reset your password — ${appName}`;
      }
    } catch {
      return NextResponse.json({ ok: true });
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
