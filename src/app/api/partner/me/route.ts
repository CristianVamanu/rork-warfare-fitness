export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — everything the partner dashboard shows, in one call: the partner
 * record, program settings that concern them, lifetime and monthly stats,
 * the ledger summary, recent ledger rows, attributed members (anonymised),
 * payouts, resources and tips.
 *
 * The caller only ever sees their own partner document — the id is their
 * uid, taken from the verified token, so there is nothing to pass and nothing
 * to tamper with.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { getPartner, getPartnerConfig } from '@/lib/partnersServer';
import { summarizeLedger, derivedStatus, effectivePercent, effectiveCapMonths, partnerLinks, toDate, type LedgerRow } from '@/lib/partners';

export async function GET(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const [partner, cfg] = await Promise.all([getPartner(db, check.uid), getPartnerConfig(db)]);
  if (!partner) return NextResponse.json({ partner: null, config: { enabled: cfg.enabled, defaultPercent: cfg.defaultPercent, agreementText: cfg.agreementText, agreementVersion: cfg.agreementVersion } });

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  const base = {
    partner: {
      uid: partner.uid, code: partner.code, status: partner.status, profile: partner.profile,
      percent: effectivePercent(partner, cfg), capMonths: effectiveCapMonths(partner, cfg),
      connectReady: !!partner.connectReady, hasConnect: !!partner.connectAccountId,
      agreementVersion: partner.agreementVersion ?? 0, agreementAcceptedAt: toDate(partner.agreementAcceptedAt)?.toISOString() ?? null,
      membershipGranted: !!partner.membershipGranted, createdAt: toDate(partner.createdAt)?.toISOString() ?? null,
    },
    config: {
      enabled: cfg.enabled, defaultPercent: cfg.defaultPercent, holdDays: cfg.holdDays, cookieDays: cfg.cookieDays,
      minPayoutCents: cfg.minPayoutCents, payoutMode: cfg.payoutMode, agreementText: cfg.agreementText, agreementVersion: cfg.agreementVersion,
    },
    links: partnerLinks(appUrl, partner.code),
  };
  if (partner.status !== 'active') return NextResponse.json({ ...base, stats: null });

  const [statsSnap, ledgerSnap, payoutsSnap, membersSnap, resSnap] = await Promise.all([
    db.collection('partnerStats').where('partnerId', '==', partner.uid).get(),
    db.collection('partnerLedger').where('partnerId', '==', partner.uid).limit(1000).get(),
    db.collection('partnerPayouts').where('partnerId', '==', partner.uid).limit(100).get(),
    db.collection('users').where('attribution.partnerId', '==', partner.uid).limit(500).get(),
    db.collection('config').doc('partnerResources').get(),
  ]);

  const months = statsSnap.docs.map((d) => d.data() as { month: string; clicks?: number; signups?: number; members?: number })
    .sort((a, b) => a.month.localeCompare(b.month));
  const totals = months.reduce((t, m) => ({ clicks: t.clicks + (m.clicks ?? 0), signups: t.signups + (m.signups ?? 0), members: t.members + (m.members ?? 0) }), { clicks: 0, signups: 0, members: 0 });

  const rows = ledgerSnap.docs.map((d) => d.data() as LedgerRow);
  const balance = summarizeLedger(rows, now);
  const ledger = rows
    .map((r) => ({
      id: r.id, status: derivedStatus(r, now), commissionCents: r.commissionCents, grossCents: r.grossCents, percent: r.percent,
      currency: r.currency, createdAt: toDate(r.createdAt)?.toISOString() ?? null, holdUntil: toDate(r.holdUntil)?.toISOString() ?? null,
      planName: r.planName ?? null, note: r.note ?? null, member: r.memberUid.slice(0, 6),
    }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 200);

  // Members: first name and plan only. No email, no uid.
  const members = membersSnap.docs.map((d) => {
    const u = d.data();
    const a = u.attribution ?? {};
    return {
      id: d.id.slice(0, 6),
      name: ((u.displayName as string) || 'Member').split(' ')[0],
      joinedAt: toDate(a.lockedAt)?.toISOString() ?? null,
      status: u.membership?.status === 'active' ? 'active' : 'inactive',
      plan: (u.membership?.planName as string) ?? null,
    };
  }).sort((a, b) => (b.joinedAt ?? '').localeCompare(a.joinedAt ?? ''));

  const payouts = payoutsSnap.docs.map((d) => {
    const p = d.data();
    return { id: d.id, amountCents: p.amountCents as number, currency: p.currency as string, status: p.status as string, method: p.method as string, createdAt: toDate(p.createdAt)?.toISOString() ?? null, period: p.period as string };
  }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  const res = resSnap.data() ?? {};
  // Next payout: the first of next month, if the balance clears the minimum.
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return NextResponse.json({
    ...base,
    stats: { totals, months: months.slice(-12), balance, nextPayoutAt: next.toISOString(), eligible: balance.payableCents >= cfg.minPayoutCents },
    ledger, members, payouts,
    resources: Array.isArray(res.items) ? res.items : [],
    tips: Array.isArray(res.tips) ? res.tips : [],
  });
}
