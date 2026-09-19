export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Emails somebody the result of the public standards test.
 *
 * Unauthenticated by design: the whole point of that page is that a stranger
 * can use it without an account. The rate limit is the throttle, and the send
 * is best effort — the visitor already has their result on screen, so a mail
 * failure must never surface to them as an error.
 *
 * Two kinds of email hide behind one box, and the difference is legal as well
 * as decent. Sending the result is something they explicitly asked for. Adding
 * them to anything ongoing is marketing and needs its own tick, which is why
 * `marketingOptIn` is separate and defaults to false. Getting that wrong costs
 * more than a fine at this size: spam complaints wreck the sending domain, and
 * the same domain carries the verification and password reset emails that
 * signup depends on.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { sendEmail, standardsResultEmailHtml } from '@/lib/email';
import { getSystemConfig } from '@/lib/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { standardFor } from '@/lib/ptStandards';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

interface ResultRow { label: string; yours: string; target: string; passed: boolean }

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit({ scope: 'standards-result', key: clientIp(req), windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const body = await req.json() as {
      email?: string; standardId?: string; marketingOptIn?: boolean; results?: ResultRow[];
    };

    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) {
      return NextResponse.json({ ok: false, reason: 'Invalid email' }, { status: 400 });
    }

    const standard = standardFor(body.standardId);
    if (!standard) return NextResponse.json({ ok: false, reason: 'Unknown standard' }, { status: 400 });

    // Trusted only as far as display. These are the visitor's own numbers
    // echoed back to them, so the cap is about the size of the email rather
    // than about correctness.
    const results = (Array.isArray(body.results) ? body.results : []).slice(0, 8).map((r) => ({
      label: String(r.label ?? '').slice(0, 40),
      yours: String(r.yours ?? '').slice(0, 12),
      target: String(r.target ?? '').slice(0, 12),
      passed: r.passed === true,
    }));
    if (results.length === 0) return NextResponse.json({ ok: false, reason: 'No results' }, { status: 400 });

    const attempted = results.filter((r) => r.yours !== '—');
    const failed = attempted.filter((r) => !r.passed);
    const passedAll = attempted.length > 0 && failed.length === 0;
    // One event to give advice about. With several, the first failed one is
    // as good a choice as any and better than hedging across all of them.
    const weakest = failed[0] ? { label: failed[0].label, yours: failed[0].yours, target: failed[0].target } : null;

    const cfg = await getSystemConfig().catch(() => null);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://warfarefitness.com';
    const brand = {
      name: (cfg?.appName as string) || 'Warfare Fitness',
      logoUrl: (cfg?.logoUrl as string) || null,
    };

    // Recorded before the send, so a lead is never lost to a mail failure.
    // Marketing consent is stored with a timestamp because "prove they opted
    // in" is the whole question if it is ever asked.
    const app = getAdminApp();
    if (app) {
      try {
        await getAdminDb(app).collection('landingLeads').add({
          email,
          createdAt: Timestamp.now(),
          source: 'standards',
          standardId: standard.id,
          marketingOptIn: body.marketingOptIn === true,
          ...(body.marketingOptIn === true ? { marketingOptInAt: Timestamp.now() } : {}),
        });
      } catch { /* the email still goes; a missing lead row is the lesser loss */ }
    }

    const subject = passedAll
      ? `You meet the ${standard.label} standard`
      : weakest
        ? `You're ${weakest.yours} against ${weakest.target} on ${weakest.label.toLowerCase()}`
        : `Your ${standard.label} result`;

    await sendEmail({
      to: email,
      subject,
      html: standardsResultEmailHtml({
        standardTitle: standard.resultTitle,
        results, weakest, passedAll, brand, appUrl,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Deliberately opaque and deliberately 200-adjacent in spirit: the caller
    // shows the same confirmation either way, because the result is already
    // on their screen and an error here is ours, not theirs.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
