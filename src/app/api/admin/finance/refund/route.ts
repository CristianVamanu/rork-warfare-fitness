export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/finance/refund   (admins only)
 * { chargeId, amount (minor units), reason, confirm: "REFUND", requestId }
 *
 * The only place the finance screens move money. Guards:
 *  - explicit confirm token and a client-generated requestId, used as the
 *    Stripe idempotency key, so a double click or a retry refunds once;
 *  - the amount is checked against what is still refundable on the charge
 *    as Stripe reports it now (not the mirror, which could be stale);
 *  - every attempt, allowed or refused, goes to the finAudit log.
 * Access changes (revoking membership on a full refund) and partner
 * clawbacks follow from the charge.refunded webhook exactly as for a refund
 * made in the Stripe dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { audit } from '@/lib/finance/sync';
import { FIN } from '@/lib/finance/types';
import { normCharge, normRefund } from '@/lib/finance/normalize';
import { rateLimit } from '@/lib/rateLimit';

const REASONS = new Set(['requested_by_customer', 'duplicate', 'fraudulent']);

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const app = getAdminApp(); const db = app ? getAdminDb(app) : null;
  if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const lim = await rateLimit({ scope: 'finance-refund', key: auth.uid, windowMs: 60_000, max: 10 });
  if (!lim.allowed) return NextResponse.json({ error: 'Too many refund requests' }, { status: 429 });

  const b = await req.json().catch(() => null) as { chargeId?: string; amount?: number; reason?: string; confirm?: string; requestId?: string } | null;
  const chargeId = typeof b?.chargeId === 'string' && /^(ch|py)_[A-Za-z0-9]+$/.test(b.chargeId) ? b.chargeId : null;
  const amount = Number(b?.amount);
  const reason = REASONS.has(String(b?.reason)) ? String(b?.reason) as Stripe.RefundCreateParams.Reason : 'requested_by_customer';
  const requestId = typeof b?.requestId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(b.requestId) ? b.requestId : null;
  const refuse = async (error: string, status = 400) => {
    await audit(db, { uid: auth.uid, action: 'finance.refund.refused', detail: { chargeId: b?.chargeId ?? null, amount: b?.amount ?? null, error } });
    return NextResponse.json({ error }, { status });
  };
  if (b?.confirm !== 'REFUND') return refuse('Refund not confirmed');
  if (!chargeId) return refuse('Invalid charge');
  if (!requestId) return refuse('Missing request id');
  if (!Number.isInteger(amount) || amount <= 0) return refuse('Amount must be a positive whole number of minor units');

  try {
    const stripe = await getStripe();
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.status !== 'succeeded') return refuse('Only a succeeded charge can be refunded');
    const refundable = charge.amount - (charge.amount_refunded ?? 0);
    if (amount > refundable) return refuse(`At most ${refundable} can still be refunded on this charge`);
    const refund = await stripe.refunds.create(
      { charge: chargeId, amount, reason, metadata: { refundedBy: auth.uid, source: 'admin-finance' } },
      { idempotencyKey: `admin-refund-${requestId}` },
    );
    // Reflect it in the mirror now; the webhook will confirm the same record.
    const fresh = await stripe.charges.retrieve(chargeId);
    await Promise.all([
      db.collection(FIN.refunds).doc(refund.id).set(normRefund(refund)),
      db.collection(FIN.charges).doc(fresh.id).set(normCharge(fresh)),
    ]);
    await audit(db, { uid: auth.uid, action: 'finance.refund', detail: { chargeId, refundId: refund.id, amount, currency: refund.currency, reason, status: refund.status } });
    return NextResponse.json({ ok: true, refund: { id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refund failed';
    await audit(db, { uid: auth.uid, action: 'finance.refund.failed', detail: { chargeId, amount, error: msg } });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
