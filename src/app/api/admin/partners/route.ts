export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — the admin partners overview: program totals, every partner with its
 * numbers, the applications queue, rows waiting for review, and settings.
 * One call, because the page shows all of it at once and the collections
 * are small (hundreds of partners, thousands of ledger rows at most).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getPartnerConfig } from '@/lib/partnersServer';
import { summarizeLedger, derivedStatus, effectivePercent, effectiveCapMonths, toDate, type LedgerRow, type PartnerDoc } from '@/lib/partners';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const now = new Date();

  const [cfg, partnersSnap, ledgerSnap, statsSnap, payoutsSnap, resSnap] = await Promise.all([
    getPartnerConfig(db),
    db.collection('partners').get(),
    db.collection('partnerLedger').limit(5000).get(),
    db.collection('partnerStats').get(),
    db.collection('partnerPayouts').limit(500).get(),
    db.collection('config').doc('partnerResources').get(),
  ]);

  const rows = ledgerSnap.docs.map((d) => d.data() as LedgerRow);
  const byPartner = new Map<string, LedgerRow[]>();
  rows.forEach((r) => { byPartner.set(r.partnerId, [...(byPartner.get(r.partnerId) ?? []), r]); });
  const statsByPartner = new Map<string, { clicks: number; signups: number; members: number }>();
  statsSnap.docs.forEach((d) => {
    const s = d.data() as { partnerId: string; clicks?: number; signups?: number; members?: number };
    const cur = statsByPartner.get(s.partnerId) ?? { clicks: 0, signups: 0, members: 0 };
    statsByPartner.set(s.partnerId, { clicks: cur.clicks + (s.clicks ?? 0), signups: cur.signups + (s.signups ?? 0), members: cur.members + (s.members ?? 0) });
  });

  const partners = partnersSnap.docs.map((d) => {
    const p = d.data() as PartnerDoc & { totals?: { revenueCents?: number } };
    const own = byPartner.get(p.uid) ?? [];
    const bal = summarizeLedger(own, now);
    const st = statsByPartner.get(p.uid) ?? { clicks: 0, signups: 0, members: 0 };
    return {
      uid: p.uid, code: p.code, status: p.status, profile: p.profile,
      percent: effectivePercent(p, cfg), percentOverride: p.percentOverride ?? null,
      capMonths: effectiveCapMonths(p, cfg), capMonthsOverride: p.capMonthsOverride ?? null,
      connect: !!p.connectAccountId, connectReady: !!p.connectReady, membershipGranted: !!p.membershipGranted,
      notes: p.notes ?? '', createdAt: toDate(p.createdAt)?.toISOString() ?? null, reviewedAt: toDate(p.reviewedAt)?.toISOString() ?? null,
      agreementVersion: p.agreementVersion ?? 0,
      stats: { ...st, revenueCents: own.reduce((t, r) => t + Math.max(0, r.grossCents), 0), conversion: st.clicks ? Math.round((st.members / st.clicks) * 1000) / 10 : 0 },
      balance: bal,
      reviewCount: own.filter((r) => derivedStatus(r, now) === 'review').length,
    };
  }).sort((a, b) => (a.status === 'applied' ? -1 : 0) - (b.status === 'applied' ? -1 : 0) || b.stats.revenueCents - a.stats.revenueCents);

  const totals = summarizeLedger(rows, now);
  const program = {
    partners: partners.filter((p) => p.status === 'active').length,
    applications: partners.filter((p) => p.status === 'applied').length,
    clicks: partners.reduce((t, p) => t + p.stats.clicks, 0),
    signups: partners.reduce((t, p) => t + p.stats.signups, 0),
    members: partners.reduce((t, p) => t + p.stats.members, 0),
    revenueCents: rows.reduce((t, r) => t + Math.max(0, r.grossCents), 0),
    ...totals,
  };
  const monthKeyNow = now.toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => (toDate(r.createdAt)?.toISOString() ?? '').startsWith(monthKeyNow));
  const monthRevenue = thisMonth.reduce((t, r) => t + Math.max(0, r.grossCents), 0);
  const monthCommission = thisMonth.reduce((t, r) => t + r.commissionCents, 0);

  const review = rows.filter((r) => derivedStatus(r, now) === 'review').map((r) => ({
    id: r.id, partnerId: r.partnerId, partnerCode: r.partnerCode, memberUid: r.memberUid, commissionCents: r.commissionCents, grossCents: r.grossCents,
    flags: r.flags, createdAt: toDate(r.createdAt)?.toISOString() ?? null, planName: r.planName ?? null,
  }));

  const payouts = payoutsSnap.docs.map((d) => {
    const p = d.data();
    return { id: d.id, partnerId: p.partnerId, partnerCode: p.partnerCode, amountCents: p.amountCents, currency: p.currency, status: p.status, method: p.method, period: p.period, createdAt: toDate(p.createdAt)?.toISOString() ?? null, transferId: p.transferId ?? null };
  }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  const res = resSnap.data() ?? {};
  return NextResponse.json({
    config: cfg, program: { ...program, monthRevenueCents: monthRevenue, monthCommissionCents: monthCommission },
    partners, review, payouts,
    resources: Array.isArray(res.items) ? res.items : [], tips: Array.isArray(res.tips) ? res.tips : [],
  });
}
