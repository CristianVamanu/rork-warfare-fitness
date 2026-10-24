export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { id, action: 'approve' | 'reject', note? } — resolve a ledger row the
 * fraud flags held for review, or overrule a pending one. Only unpaid rows
 * can change; a paid row is history and is corrected with an adjustment.
 *
 * POST { adjust: { partnerId, amountCents, note } } — a manual adjustment row
 * (positive bonus or negative correction). Always approved, always noted,
 * always with the admin's uid on it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getPartner } from '@/lib/partnersServer';
import type { LedgerRow } from '@/lib/partners';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const body = await req.json().catch(() => ({})) as { id?: string; action?: string; note?: string; adjust?: { partnerId?: string; amountCents?: number; note?: string } };

  if (body.adjust) {
    const { partnerId, amountCents, note } = body.adjust;
    if (!partnerId || !Number.isFinite(amountCents) || !amountCents || !note || note.trim().length < 3) {
      return NextResponse.json({ error: 'Adjustment needs a partner, a non-zero amount and a note.' }, { status: 400 });
    }
    const partner = await getPartner(db, partnerId);
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    const id = `adj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const row: LedgerRow = {
      id, partnerId, partnerCode: partner.code, memberUid: '', invoiceId: id, chargeId: null, subscriptionId: null,
      grossCents: 0, feeCents: 0, netCents: 0, percent: 0, commissionCents: Math.round(amountCents as number), currency: 'usd',
      status: 'approved', flags: [], holdUntil: null, payoutId: null, createdAt: new Date(), reverses: null, planName: null,
      note: `Adjustment by admin: ${note.trim().slice(0, 300)}`,
    };
    await db.collection('partnerLedger').doc(id).create(row);
    await db.collection('adminActions').add({ at: FieldValue.serverTimestamp(), by: check.uid, userId: partnerId, action: `partner.adjust:${row.commissionCents}` });
    return NextResponse.json({ ok: true, id });
  }

  if (!body.id || (body.action !== 'approve' && body.action !== 'reject')) return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  const ref = db.collection('partnerLedger').doc(body.id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  const row = snap.data() as LedgerRow;
  if (row.status === 'paid' || row.status === 'clawback') return NextResponse.json({ error: 'This row is settled. Use an adjustment instead.' }, { status: 409 });
  await ref.set({
    status: body.action === 'approve' ? 'approved' : 'rejected',
    reviewedAt: FieldValue.serverTimestamp(), reviewedBy: check.uid,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : (row.note ?? null),
    // The flags stay on the row as the record of why it was held.
  }, { merge: true });
  await db.collection('adminActions').add({ at: FieldValue.serverTimestamp(), by: check.uid, userId: row.partnerId, action: `partner.ledger.${body.action}:${body.id}` });
  return NextResponse.json({ ok: true });
}
