export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, trainerLeadEmailHtml } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { verifyTurnstile } from '@/lib/turnstile';

// Notifies the business owner of a new /trainers demo request. Deliberately
// unauthenticated — the visitor submitting this form hasn't signed up or
// logged in yet, there's nothing to verify a token against. The lead itself
// is already validated/shape-checked by firestore.rules before this fires;
// this route only sends a best-effort notification email, so a failure
// here never blocks the lead from being saved (see createTrainerLead).

// In-memory per-IP throttle — this is an unauthenticated public endpoint
// with no other rate limiting, so without this it could be scripted to
// spam the Resend account and/or flood the notification inbox. Not a
// distributed limiter (resets per server instance/restart), but a real
// floor against casual abuse; the Firestore lead write itself has its own
// shape/size validation as a second layer.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const limited = await rateLimit({ scope: 'trainer-lead', key: ip, windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, reason: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }


    const body = await req.json() as {
      name?: string; email?: string; businessName?: string; phone?: string; clientCount?: string; message?: string;
      turnstileToken?: string;
    };
    if (!body.name || !body.email || !/^\S+@\S+\.\S+$/.test(body.email)) {
      return NextResponse.json({ ok: false, reason: 'Invalid lead payload' }, { status: 400 });
    }

    // See landing-lead — inert until TURNSTILE_SECRET_KEY is configured.
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return NextResponse.json({ ok: false, reason: 'Failed bot check' }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const sent = await sendEmail({
      to: 'digimetrixuk@gmail.com',
      subject: `New /trainers demo request — ${body.name}`,
      html: trainerLeadEmailHtml({
        name: body.name,
        email: body.email,
        businessName: body.businessName,
        phone: body.phone,
        clientCount: body.clientCount,
        message: body.message,
      }, appUrl),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/trainer-lead] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
