export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST — apply to the partner program. One application per account; the
 * partner document id is the uid, so a second submit updates the pending
 * application rather than creating another. A rejected account can re-apply
 * (status goes back to 'applied'); a suspended one cannot.
 *
 * The code is claimed here, at application time, so the applicant sees their
 * link immediately on approval. Claiming is `create()` on partnerCodes/{CODE}:
 * it throws on a duplicate, which is the whole uniqueness guarantee.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { resolveAccountEmail } from '@/lib/accountEmail';
import { getPartner, getPartnerConfig } from '@/lib/partnersServer';
import { generatePartnerCode, normalizePartnerCode, type PartnerProfile } from '@/lib/partners';
import { sendEmail, partnerApplicationReceivedEmailHtml, adminPartnerApplicationEmailHtml } from '@/lib/email';

const RESERVED = new Set(['ADMIN', 'PARTNER', 'PARTNERS', 'WARFARE', 'WF', 'TEST', 'NULL', 'UNDEFINED', 'API', 'LOGIN', 'SIGNUP']);

export async function POST(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const cfg = await getPartnerConfig(db);
  if (!cfg.enabled) return NextResponse.json({ error: 'The partner program is not accepting applications right now.' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Partial<PartnerProfile> & { code?: unknown; agree?: boolean };
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const profile: PartnerProfile = {
    name: str(body.name, 80), email: str(body.email, 120).toLowerCase(), channels: str(body.channels, 500),
    audience: str(body.audience, 120), about: str(body.about, 2000), website: str(body.website, 200) || undefined,
  };
  if (profile.name.length < 2) return NextResponse.json({ error: 'Your name is required.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(profile.email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  if (profile.channels.length < 3) return NextResponse.json({ error: 'Tell us where you will promote.' }, { status: 400 });
  if (profile.about.length < 20) return NextResponse.json({ error: 'Tell us a little more about you and your audience (20+ characters).' }, { status: 400 });
  if (body.agree !== true) return NextResponse.json({ error: 'You need to accept the partner agreement.' }, { status: 400 });

  const existing = await getPartner(db, check.uid);
  if (existing?.status === 'active') return NextResponse.json({ ok: true, status: 'active', code: existing.code });
  if (existing?.status === 'suspended') return NextResponse.json({ error: 'This account\'s partner access is suspended. Contact support.' }, { status: 403 });

  // Preferred handle, or a generated code. Kept on re-application.
  let code = existing?.code ?? null;
  if (!code) {
    const wanted = normalizePartnerCode(body.code);
    const candidates = wanted && !RESERVED.has(wanted) ? [wanted] : [];
    for (let i = 0; i < 6; i++) candidates.push(generatePartnerCode());
    for (const c of candidates) {
      try {
        await db.collection('partnerCodes').doc(c).create({ partnerId: check.uid, createdAt: FieldValue.serverTimestamp() });
        code = c; break;
      } catch { /* taken — next */ }
    }
    if (!code) return NextResponse.json({ error: 'Could not reserve a code. Try again.' }, { status: 500 });
    if (wanted && code !== wanted) {
      // Tell them, but do not fail: the application matters more than the handle.
      console.info(`[partner apply] handle ${wanted} taken, issued ${code} to ${check.uid}`);
    }
  }

  await db.collection('partners').doc(check.uid).set({
    uid: check.uid, code, status: 'applied', profile,
    agreementVersion: cfg.agreementVersion, agreementAcceptedAt: FieldValue.serverTimestamp(),
    createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(), appliedAt: FieldValue.serverTimestamp(),
    reviewedAt: FieldValue.delete(), reviewedBy: FieldValue.delete(),
  }, { merge: true });

  // Confirmation to the applicant and a heads-up to the admin, both best effort.
  try {
    const cfgSnap = await db.collection('system').doc('config').get();
    const sys = cfgSnap.data() ?? {};
    const brand = { name: (sys.appName as string) || 'Warfare Fitness', logoUrl: (sys.logoUrl as string) || null };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const to = await resolveAccountEmail(check.uid, profile.email);
    if (to) await sendEmail({ kind: 'partnerStatus', to, subject: `We got your partner application`, html: partnerApplicationReceivedEmailHtml(profile.name, brand, appUrl) });
    const adminTo = (sys.trainerEmail as string) || undefined;
    if (adminTo) await sendEmail({ kind: 'adminAlert', to: adminTo, subject: `New partner application: ${profile.name}`, html: adminPartnerApplicationEmailHtml(profile, code, brand, appUrl) });
  } catch (err) {
    console.warn('[partner apply] notification failed:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, status: 'applied', code, requestedHandleGranted: !body.code || normalizePartnerCode(body.code) === code });
}
