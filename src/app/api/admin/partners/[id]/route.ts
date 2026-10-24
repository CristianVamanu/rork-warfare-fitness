export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  — one partner in full: record, ledger rows, attributed members, payouts.
 * POST — change it: { status?, percentOverride?, capMonthsOverride?, notes?, reason? }
 *
 * Status changes carry their consequences: approving grants the free
 * membership (if the program says so) and emails the partner; suspending or
 * rejecting takes the perk back and emails the reason. Every change is an
 * adminActions row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getPartner, getPartnerConfig, setPartnerMembership } from '@/lib/partnersServer';
import { derivedStatus, effectivePercent, summarizeLedger, toDate, type LedgerRow, type PartnerStatus } from '@/lib/partners';
import { resolveAccountEmail } from '@/lib/accountEmail';
import { sendEmail, partnerDecisionEmailHtml } from '@/lib/email';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const { id } = await ctx.params;
  const partner = await getPartner(db, id);
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const now = new Date();
  const [ledgerSnap, membersSnap, payoutsSnap, userSnap] = await Promise.all([
    db.collection('partnerLedger').where('partnerId', '==', id).limit(2000).get(),
    db.collection('users').where('attribution.partnerId', '==', id).limit(1000).get(),
    db.collection('partnerPayouts').where('partnerId', '==', id).limit(200).get(),
    db.collection('users').doc(id).get(),
  ]);
  const rows = ledgerSnap.docs.map((d) => d.data() as LedgerRow);
  const memberEmail = new Map(membersSnap.docs.map((d) => [d.id, d.data()]));
  return NextResponse.json({
    partner: { ...partner, createdAt: toDate(partner.createdAt)?.toISOString() ?? null, reviewedAt: toDate(partner.reviewedAt)?.toISOString() ?? null, agreementAcceptedAt: toDate(partner.agreementAcceptedAt)?.toISOString() ?? null },
    account: { email: userSnap.data()?.email ?? null, displayName: userSnap.data()?.displayName ?? null, membership: userSnap.data()?.membership?.status ?? 'none' },
    balance: summarizeLedger(rows, now),
    ledger: rows.map((r) => ({
      ...r, status: derivedStatus(r, now), storedStatus: r.status, createdAt: toDate(r.createdAt)?.toISOString() ?? null, holdUntil: toDate(r.holdUntil)?.toISOString() ?? null,
      memberEmail: (memberEmail.get(r.memberUid)?.email as string) ?? null,
    })).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    members: membersSnap.docs.map((d) => {
      const u = d.data();
      return { uid: d.id, email: u.email ?? null, name: u.displayName ?? null, joinedAt: toDate(u.attribution?.lockedAt)?.toISOString() ?? null, status: u.membership?.status ?? 'none', plan: u.membership?.planName ?? null, source: u.attribution?.source ?? null };
    }).sort((a, b) => (b.joinedAt ?? '').localeCompare(a.joinedAt ?? '')),
    payouts: payoutsSnap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt)?.toISOString() ?? null })),
  });
}

const STATUSES: PartnerStatus[] = ['applied', 'active', 'suspended', 'rejected'];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const { id } = await ctx.params;
  const partner = await getPartner(db, id);
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { status?: unknown; percentOverride?: unknown; capMonthsOverride?: unknown; notes?: unknown; reason?: unknown };

  const update: Record<string, unknown> = {};
  const changes: string[] = [];
  if ('percentOverride' in body) {
    const v = body.percentOverride;
    if (v === null || v === '') { update.percentOverride = null; changes.push('percent:default'); }
    else { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 90) return NextResponse.json({ error: 'Percent must be 0–90' }, { status: 400 }); update.percentOverride = Math.round(n); changes.push(`percent:${Math.round(n)}`); }
  }
  if ('capMonthsOverride' in body) {
    const v = body.capMonthsOverride;
    if (v === null || v === '' || Number(v) === 0) { update.capMonthsOverride = null; changes.push('cap:default'); }
    else { const n = Number(v); if (!Number.isFinite(n) || n < 1 || n > 120) return NextResponse.json({ error: 'Cap must be 1–120 months' }, { status: 400 }); update.capMonthsOverride = Math.round(n); changes.push(`cap:${Math.round(n)}`); }
  }
  if (typeof body.notes === 'string') { update.notes = body.notes.slice(0, 4000); changes.push('notes'); }

  let decision: PartnerStatus | null = null;
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as PartnerStatus)) return NextResponse.json({ error: 'Bad status' }, { status: 400 });
    if (body.status !== partner.status) {
      decision = body.status as PartnerStatus;
      update.status = decision; update.reviewedAt = FieldValue.serverTimestamp(); update.reviewedBy = check.uid;
      if (typeof body.reason === 'string' && body.reason.trim()) update.decisionReason = body.reason.trim().slice(0, 500);
      changes.push(`status:${decision}`);
    }
  }
  if (!changes.length) return NextResponse.json({ ok: true, changed: [] });

  await db.collection('partners').doc(id).set(update, { merge: true });
  await db.collection('adminActions').add({ at: FieldValue.serverTimestamp(), by: check.uid, userId: id, action: `partner.${changes.join(',')}` });

  if (decision) {
    const cfg = await getPartnerConfig(db);
    try {
      if (decision === 'active' && cfg.freeMembership) await setPartnerMembership(db, id, true);
      if (decision === 'suspended' || decision === 'rejected') await setPartnerMembership(db, id, false);
    } catch (err) { console.error('[admin/partners] membership perk update failed:', err); }
    try {
      const sysSnap = await db.collection('system').doc('config').get();
      const sys = sysSnap.data() ?? {};
      const brand = { name: (sys.appName as string) || 'Warfare Fitness', logoUrl: (sys.logoUrl as string) || null };
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
      const to = await resolveAccountEmail(id, partner.profile?.email);
      if (to && decision !== 'applied') {
        const subject = decision === 'active' ? 'You are approved as a partner' : decision === 'suspended' ? 'Your partner account is paused' : 'Your partner application';
        await sendEmail({ kind: 'partnerStatus', to, subject, html: partnerDecisionEmailHtml(partner.profile?.name || 'there', decision, { code: partner.code, percent: effectivePercent({ percentOverride: (update.percentOverride as number | null | undefined) ?? partner.percentOverride }, cfg), reason: typeof body.reason === 'string' ? body.reason : undefined }, brand, appUrl) });
      }
    } catch (err) { console.warn('[admin/partners] decision email failed:', err); }
  }
  return NextResponse.json({ ok: true, changed: changes });
}
