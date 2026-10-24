export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { partnerId?, dryRun? } — the payout run.
 *
 * For each active partner (or the one named): approved rows minus unpaid
 * clawbacks. If that clears the minimum, a payout document is created, every
 * row it covers is marked paid with the payout id, and — in 'connect' mode
 * with a ready account — a Stripe transfer is made. In 'manual' mode, or when
 * the partner has no ready account, the payout is recorded as 'manual' for
 * the admin to pay by bank and the partner is told so.
 *
 * Rows are marked paid in a transaction BEFORE the transfer. If the transfer
 * fails, the payout is marked 'failed' and the rows are released again. The
 * alternative order (transfer, then mark) can pay twice on a crash between
 * the two; this order can at worst leave a 'failed' payout to re-run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';
import { getPartnerConfig } from '@/lib/partnersServer';
import { derivedStatus, formatCents, type LedgerRow, type PartnerDoc } from '@/lib/partners';
import { resolveAccountEmail } from '@/lib/accountEmail';
import { sendEmail, partnerPayoutEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const body = await req.json().catch(() => ({})) as { partnerId?: string; dryRun?: boolean };
  const cfg = await getPartnerConfig(db);
  const now = new Date();
  const period = now.toISOString().slice(0, 7);

  const partnersSnap = body.partnerId
    ? [await db.collection('partners').doc(body.partnerId).get()]
    : (await db.collection('partners').where('status', '==', 'active').get()).docs;

  const results: { partnerId: string; code: string; amountCents: number; outcome: string; payoutId?: string }[] = [];
  const sysSnap = await db.collection('system').doc('config').get();
  const sys = sysSnap.data() ?? {};
  const brand = { name: (sys.appName as string) || 'Warfare Fitness', logoUrl: (sys.logoUrl as string) || null };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';

  for (const pSnap of partnersSnap) {
    if (!pSnap.exists) continue;
    const partner = pSnap.data() as PartnerDoc;
    const ledgerSnap = await db.collection('partnerLedger').where('partnerId', '==', partner.uid).limit(5000).get();
    const rows = ledgerSnap.docs.map((d) => ({ ref: d.ref, row: d.data() as LedgerRow }));
    const due = rows.filter(({ row }) => !row.payoutId && (derivedStatus(row, now) === 'approved' || row.status === 'clawback'));
    const amount = due.reduce((t, { row }) => t + row.commissionCents, 0);
    if (amount < cfg.minPayoutCents || amount <= 0 || due.length === 0) {
      results.push({ partnerId: partner.uid, code: partner.code, amountCents: amount, outcome: amount <= 0 ? 'nothing_due' : 'below_minimum' });
      continue;
    }
    if (body.dryRun) { results.push({ partnerId: partner.uid, code: partner.code, amountCents: amount, outcome: 'would_pay' }); continue; }

    const useConnect = cfg.payoutMode === 'connect' && !!partner.connectAccountId && !!partner.connectReady;
    const payoutRef = db.collection('partnerPayouts').doc();
    const currency = due[0].row.currency || 'usd';
    await db.runTransaction(async (tx) => {
      tx.set(payoutRef, {
        partnerId: partner.uid, partnerCode: partner.code, amountCents: amount, currency, period,
        method: useConnect ? 'connect' : 'manual', status: useConnect ? 'processing' : 'manual_pending',
        rowIds: due.map(({ row }) => row.id), createdAt: FieldValue.serverTimestamp(), createdBy: check.uid,
      });
      due.forEach(({ ref, row }) => tx.set(ref, { payoutId: payoutRef.id, ...(row.status !== 'clawback' ? { status: 'paid' } : {}), paidAt: FieldValue.serverTimestamp() }, { merge: true }));
    });

    let outcome = useConnect ? 'transferred' : 'recorded_manual';
    if (useConnect) {
      try {
        const stripe = await getStripe();
        const transfer = await stripe.transfers.create({
          amount, currency, destination: partner.connectAccountId!,
          description: `${brand.name} partner commission ${period}`,
          metadata: { partnerId: partner.uid, payoutId: payoutRef.id },
        }, { idempotencyKey: `partner_payout_${payoutRef.id}` });
        await payoutRef.set({ status: 'paid', transferId: transfer.id, paidAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[partner payouts] transfer failed, releasing rows:', msg);
        await db.runTransaction(async (tx) => {
          tx.set(payoutRef, { status: 'failed', error: msg.slice(0, 500) }, { merge: true });
          due.forEach(({ ref, row }) => tx.set(ref, { payoutId: null, ...(row.status !== 'clawback' ? { status: row.status === 'pending' ? 'approved' : row.status } : {}), paidAt: FieldValue.delete() }, { merge: true }));
        });
        outcome = `failed: ${msg}`;
        results.push({ partnerId: partner.uid, code: partner.code, amountCents: amount, outcome, payoutId: payoutRef.id });
        continue;
      }
    }
    try {
      const to = await resolveAccountEmail(partner.uid, partner.profile?.email);
      if (to) await sendEmail({ kind: 'partnerStatus', to, subject: `Payout: ${formatCents(amount, currency.toUpperCase())}`, html: partnerPayoutEmailHtml(partner.profile?.name || 'there', formatCents(amount, currency.toUpperCase()), useConnect ? 'connect' : 'manual', brand, appUrl) });
    } catch { /* best effort */ }
    results.push({ partnerId: partner.uid, code: partner.code, amountCents: amount, outcome, payoutId: payoutRef.id });
  }

  if (!body.dryRun) await db.collection('adminActions').add({ at: FieldValue.serverTimestamp(), by: check.uid, action: `partner.payouts:${results.filter((r) => r.payoutId).length}` });
  return NextResponse.json({ ok: true, period, results });
}

/** PATCH { payoutId, status: 'paid' } — the admin confirms a manual bank transfer went out. */
export async function PATCH(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const body = await req.json().catch(() => ({})) as { payoutId?: string; status?: string; reference?: string };
  if (!body.payoutId || body.status !== 'paid') return NextResponse.json({ error: 'payoutId and status=paid required' }, { status: 400 });
  const ref = db.collection('partnerPayouts').doc(body.payoutId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await ref.set({ status: 'paid', paidAt: FieldValue.serverTimestamp(), paidBy: check.uid, reference: typeof body.reference === 'string' ? body.reference.slice(0, 200) : null }, { merge: true });
  return NextResponse.json({ ok: true });
}
