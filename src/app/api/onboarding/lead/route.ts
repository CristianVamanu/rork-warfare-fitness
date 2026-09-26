export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST {email, name?, optIn, campaign?} — the quiz's email step, before the
 * reveal. Server-side because consent is recorded here: firestore.rules
 * deliberately refuses marketingOptIn from a client write, so the only way
 * a lead ends up in the quiz-abandon sequence is through this route, with
 * the timestamp of the tick. A lead that already exists for this email is
 * updated, never duplicated, and never has its sequence reset (someone who
 * comes back twice is not emailed twice as often).
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { normalizeCampaign } from '@/lib/funnel';

export async function POST(req: NextRequest) {
  const limit = await rateLimit({ scope: 'onboarding-lead', key: clientIp(req), windowMs: 15 * 60_000, max: 20 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  const body = await req.json().catch(() => null) as { email?: unknown; name?: unknown; optIn?: unknown; campaign?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const optIn = body?.optIn === true;
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const db = getAdminDb(app);
  try {
    const existing = await db.collection('landingLeads').where('email', '==', email).where('source', '==', 'onboarding').limit(1).get();
    const consent = optIn ? { marketingOptIn: true, marketingOptInAt: FieldValue.serverTimestamp() } : { marketingOptIn: false };
    if (existing.empty) {
      await db.collection('landingLeads').add({
        email, ...(name ? { name } : {}), source: 'onboarding', campaign: normalizeCampaign(body?.campaign),
        ...consent, createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      // A fresh "yes" is recorded; a missing tick never revokes an earlier one
      // (the unsubscribe link is the only thing that does that).
      await existing.docs[0].ref.update({ ...(name ? { name } : {}), ...(optIn ? consent : {}), lastSeenAt: FieldValue.serverTimestamp() });
    }
  } catch (err) {
    console.error('[onboarding/lead]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
