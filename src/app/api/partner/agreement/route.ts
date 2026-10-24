export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST — the signed-in partner accepts the current agreement version. */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { getPartner, getPartnerConfig } from '@/lib/partnersServer';

export async function POST(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const [partner, cfg] = await Promise.all([getPartner(db, check.uid), getPartnerConfig(db)]);
  if (!partner) return NextResponse.json({ error: 'Not a partner' }, { status: 404 });
  await db.collection('partners').doc(check.uid).set({ agreementVersion: cfg.agreementVersion, agreementAcceptedAt: FieldValue.serverTimestamp() }, { merge: true });
  return NextResponse.json({ ok: true, version: cfg.agreementVersion });
}
