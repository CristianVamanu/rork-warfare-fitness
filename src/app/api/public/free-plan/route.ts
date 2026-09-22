export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The free-plan signup: an email in, day one out — immediately, so the
 * first thing that happens after the form is a real workout arriving, not
 * a "thanks, watch your inbox".
 *
 * Consent is scoped honestly. Asking for the plan IS consent to receive
 * the plan (that is the service they requested), so the drip needs no
 * checkbox; the ongoing-tips box is separate and unticked. Every drip
 * email still carries the one-click unsubscribe, and using it stops the
 * drip too — a person who says stop is not made to explain which emails.
 *
 * Idempotent per address: a second signup from the same email while a
 * drip is running does not restart it, so refreshing the page cannot
 * double anyone's inbox.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { sendEmail, dripEmailHtml } from '@/lib/email';
import { freePlanConfig, findOffer, dripDayFor, sessionSubject } from '@/lib/freePlan';
import { unsubscribeUrl, unsubscribeSecret } from '@/lib/emailUnsubscribe';
import { MOCK_PROGRAMS } from '@/lib/programs';
import type { Program } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit({ scope: 'free-plan', key: clientIp(req), windowMs: 15 * 60 * 1000, max: 5 });
    if (!limited.allowed) return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });

    const body = await req.json().catch(() => ({})) as { email?: string; marketingOptIn?: boolean; programId?: string };
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return NextResponse.json({ ok: false, reason: 'Invalid email' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ ok: false }, { status: 500 });
    const db = getAdminDb(app);

    const cfgSnap = await db.doc('system/config').get();
    const cfg = cfgSnap.data() ?? {};
    const plan = freePlanConfig(cfg as { freePlan?: Record<string, unknown> });
    // The program must be one the admin put on offer — a request cannot
    // name any program in the database and get its first week for free.
    const offer = findOffer(plan, typeof body.programId === 'string' ? body.programId : undefined);
    if (!offer) return NextResponse.json({ ok: false, reason: 'Not available' }, { status: 404 });

    const secret = unsubscribeSecret();
    if (!secret) return NextResponse.json({ ok: false, reason: 'Not available' }, { status: 503 });

    const progSnap = await db.collection('programs').doc(offer.id).get();
    const program = (progSnap.exists ? { id: progSnap.id, ...progSnap.data() } : MOCK_PROGRAMS.find((p) => p.id === offer.id)) as Program | undefined;
    const first = program ? dripDayFor(program, 1) : null;
    if (!program || !first) return NextResponse.json({ ok: false, reason: 'Not available' }, { status: 404 });

    // Already running for this address? Say yes and change nothing.
    const existing = await db.collection('landingLeads').where('email', '==', email).where('source', '==', 'free-plan').limit(5).get();
    if (existing.docs.some((d) => d.data().dripActive === true)) return NextResponse.json({ ok: true, already: true });

    const leadRef = await db.collection('landingLeads').add({
      email,
      createdAt: Timestamp.now(),
      source: 'free-plan',
      programId: program.id,
      programName: program.name,
      dripDays: plan.days,
      dripActive: true,
      drip: {},
      marketingOptIn: body.marketingOptIn === true,
      ...(body.marketingOptIn === true ? { marketingOptInAt: Timestamp.now() } : {}),
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://warfarefitness.com';
    const brand = { name: (cfg.appName as string) || 'Warfare Fitness', logoUrl: (cfg.logoUrl as string) || null };
    const unsub = unsubscribeUrl(appUrl, secret, email, 'lead');
    const ok = await sendEmail({
      to: email,
      subject: sessionSubject(program.name, 1, plan.days, first.day),
      unsubscribeUrl: unsub,
      html: dripEmailHtml({ brand, appUrl, program, dayNumber: 1, totalDays: plan.days, session: first.day, unsubscribeUrl: unsub }),
    });
    if (ok) {
      await leadRef.update({ 'drip.d1': FieldValue.serverTimestamp() });
      await db.doc('system/emailStats').set({ counts: { drip: { d1: FieldValue.increment(1) } } }, { merge: true }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[free-plan]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
