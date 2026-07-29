export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, trainerLeadEmailHtml } from '@/lib/email';

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
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  // Prevent unbounded growth of the map across many distinct IPs over time.
  if (requestLog.size > 5000) requestLog.clear();
  return timestamps.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ ok: false, reason: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json() as {
      name?: string; email?: string; businessName?: string; phone?: string; clientCount?: string; message?: string;
    };
    if (!body.name || !body.email || !/^\S+@\S+\.\S+$/.test(body.email)) {
      return NextResponse.json({ ok: false, reason: 'Invalid lead payload' }, { status: 400 });
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
