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
export async function POST(req: NextRequest) {
  try {
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
