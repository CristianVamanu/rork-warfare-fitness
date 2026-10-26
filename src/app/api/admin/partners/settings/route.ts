export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET / POST config/partnerProgram. Clamped through normalizePartnerConfig
 *  so a typo in the form cannot set a 300% commission. Changing the agreement
 *  text bumps the version, which asks every partner to re-accept. */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getPartnerConfig } from '@/lib/partnersServer';
import { normalizePartnerConfig, type PartnerProgramConfig } from '@/lib/partners';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  return NextResponse.json({ config: await getPartnerConfig(getAdminDb(app)) });
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const current = await getPartnerConfig(db);
  const body = await req.json().catch(() => ({})) as Partial<PartnerProgramConfig>;
  const next = normalizePartnerConfig({ ...current, ...body });
  if (next.agreementText !== current.agreementText) next.agreementVersion = current.agreementVersion + 1;
  else next.agreementVersion = current.agreementVersion;
  await db.collection('config').doc('partnerProgram').set({ ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy: check.uid });
  await db.collection('adminActions').add({ at: FieldValue.serverTimestamp(), by: check.uid, action: 'partner.settings' });
  return NextResponse.json({ ok: true, config: next });
}
