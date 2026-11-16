export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/finance?view=...&from=&to=&tz=&cur=   (admins only)
 *
 * One read endpoint for the Finance screens. Every figure is computed on the
 * server from the Stripe mirror for a single currency; lists are filtered,
 * sorted and paginated here so the browser only receives one page.
 *
 * views: overview | customers | customer | transactions | subscriptions |
 *        recovery | refunds | forecast
 */
import { NextRequest, NextResponse } from 'next/server';
import { financeRequest, profiles, signupsBetween } from '@/lib/finance/server';
import {
  autoGran, cohorts, customerRows, forecast, kpis, ledger, mrrSeries, plans, recovery, revenueSeries, storeTotals, subStatus, planKey,
  type CustomerRow, type Gran, type LedgerRow,
} from '@/lib/finance/metrics';

const PAGE = 50;

export async function GET(req: NextRequest) {
  const r = await financeRequest(req);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { ctx, from, to, data, meta, db, currencies } = r;
  const sp = req.nextUrl.searchParams;
  const view = sp.get('view') ?? 'overview';
  const base = { currency: ctx.cur, currencies, from, to, tz: ctx.tz, meta: { lastSyncAt: meta.lastSyncAt, lastFullSyncAt: meta.lastFullSyncAt, mirrorSince: meta.mirrorSince, storeLedgerSince: meta.storeLedgerSince, lastError: meta.lastError } };
  const needsSync = !meta.lastFullSyncAt;
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const q = (sp.get('q') ?? '').trim().toLowerCase();

  try {
    switch (view) {
      case 'overview': {
        const gran = (['day', 'week', 'month', 'year'].includes(sp.get('gran') ?? '') ? sp.get('gran') : autoGran(from, to)) as Gran;
        const signups = await signupsBetween(db, from, to);
        const store = storeTotals(data.storeEvents, ctx.cur, from, to);
        return NextResponse.json({
          ...base, needsSync, gran,
          kpis: kpis(ctx, from, to), revenue: revenueSeries(ctx, from, to, gran),
          mrr: mrrSeries(ctx, from, to, gran === 'day' && to - from > 14 * 86_400 ? 'week' : gran, signups),
          plans: plans(ctx, from, to), cohorts: cohorts(ctx), store,
        });
      }
      case 'customers': {
        const prof = await profiles(db, data);
        let rows = customerRows(data, prof).filter((x) => !x.currency || x.currency === ctx.cur);
        const status = sp.get('status'); const plan = sp.get('plan');
        if (status) rows = rows.filter((x) => status.split(',').includes(x.status));
        if (plan) rows = rows.filter((x) => x.plan === plan);
        if (q) rows = rows.filter((x) => [x.name, x.email, x.id, x.uid].some((v) => v?.toLowerCase().includes(q)));
        rows = sortRows(rows, sp.get('sort') ?? 'ltv', sp.get('dir') === 'asc');
        return NextResponse.json({ ...base, needsSync, total: rows.length, page, pageSize: PAGE, rows: rows.slice((page - 1) * PAGE, page * PAGE) });
      }
      case 'customer': {
        const id = sp.get('id') ?? '';
        const prof = await profiles(db, data);
        const row = customerRows(data, prof).find((x) => x.id === id);
        if (!row) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        const cust = data.customers.find((c) => c.id === id) ?? null;
        const subs = data.subscriptions.filter((s) => s.customer === id).sort((a, b) => b.created - a.created)
          .map((s) => ({ ...s, plan: planKey(s), displayStatus: subStatus(s) }));
        const tx = ledger(data).filter((x) => x.customer === id);
        const p = row.uid ? prof.get(row.uid) : undefined;
        const ok = tx.filter((x) => x.status !== 'failed' && x.type !== 'refund' && x.type !== 'chargeback' && x.status !== 'pending');
        const refunded = tx.filter((x) => x.type === 'refund' && x.status === 'succeeded').reduce((a, x) => a - x.amount, 0);
        const collected = ok.filter((x) => x.currency === row.currency).reduce((a, x) => a + x.amount, 0);
        const first = subs.length ? Math.min(...subs.map((s) => s.startDate)) : row.startDate;
        const last = subs.find((s) => s.endedAt)?.endedAt;
        const active = subs.some((s) => ['active', 'trialing', 'past_due'].includes(s.status));
        const timeline = buildTimeline(p?.createdAt ?? cust?.created ?? null, subs, tx);
        return NextResponse.json({
          ...base, customer: row, stripeCustomer: cust, registeredAt: p?.createdAt ?? null, subscriptions: subs, transactions: tx, timeline,
          summary: {
            collected, refunded, net: collected - refunded, payments: ok.length, failed: tx.filter((x) => x.status === 'failed').length,
            average: ok.length ? Math.round(collected / ok.length) : 0, ltv: collected - refunded,
            durationDays: first ? Math.round(((active ? ctx.now : last ?? ctx.now) - first) / 86_400) : null,
          },
          links: { stripe: `https://dashboard.stripe.com/customers/${encodeURIComponent(id)}` },
        });
      }
      case 'transactions': {
        const prof = await profiles(db, data);
        const custs = new Map(customerRows(data, prof).map((c) => [c.id, c]));
        let rows = ledger(data).filter((x) => x.currency === ctx.cur && x.at >= from && x.at < to);
        const type = sp.get('type'); const status = sp.get('status'); const plan = sp.get('plan'); const pm = sp.get('pm'); const cust = sp.get('customer');
        if (type) rows = rows.filter((x) => type.split(',').includes(x.type));
        if (status) rows = rows.filter((x) => status.split(',').includes(x.status));
        if (cust) rows = rows.filter((x) => x.customer === cust);
        if (plan) rows = rows.filter((x) => x.customer && custs.get(x.customer)?.plan === plan);
        if (pm) rows = rows.filter((x) => (x.pm ?? '').toLowerCase().includes(pm.toLowerCase()));
        if (q) rows = rows.filter((x) => { const c = x.customer ? custs.get(x.customer) : undefined; return [x.id, x.reference, x.description, c?.name, c?.email, x.customer].some((v) => v?.toLowerCase().includes(q)); });
        rows = sortLedger(rows, sp.get('sort') ?? 'date', sp.get('dir') === 'asc');
        const pageRows = rows.slice((page - 1) * PAGE, page * PAGE).map((x) => ({ ...x, customerName: x.customer ? custs.get(x.customer)?.name ?? null : null, customerEmail: x.customer ? custs.get(x.customer)?.email ?? null : null }));
        const totals = rows.reduce((a, x) => { if (x.status === 'succeeded' || x.status === 'refunded' || x.status === 'partially_refunded' || x.status === 'disputed') a.in += Math.max(0, x.amount); if (x.type === 'refund' && x.status === 'succeeded') a.out -= x.amount; return a; }, { in: 0, out: 0 });
        return NextResponse.json({ ...base, needsSync, total: rows.length, page, pageSize: PAGE, rows: pageRows, totals });
      }
      case 'subscriptions': {
        const prof = await profiles(db, data);
        const cur = data.subscriptions.filter((s) => s.items[0]?.currency === ctx.cur);
        const soon = ctx.now + 7 * 86_400;
        const inP = (t: number | null) => t != null && t >= from && t < to;
        const custs = new Map(customerRows(data, prof).map((c) => [c.id, c]));
        const list = (pred: (s: typeof cur[number]) => boolean) => cur.filter(pred).map((s) => ({ id: s.id, customer: s.customer, name: custs.get(s.customer)?.name ?? null, email: custs.get(s.customer)?.email ?? null, plan: planKey(s), status: subStatus(s), renews: s.currentPeriodEnd, endsAt: s.cancelAt ?? s.currentPeriodEnd }));
        const plan = sp.get('plan');
        return NextResponse.json({
          ...base, needsSync,
          counts: {
            total: cur.length, active: cur.filter((s) => s.status === 'active' || s.status === 'past_due').length, trialing: cur.filter((s) => s.status === 'trialing').length,
            newInPeriod: cur.filter((s) => inP(s.created)).length, cancelledInPeriod: cur.filter((s) => inP(s.endedAt)).length,
            dueRenewal7d: cur.filter((s) => s.status === 'active' && !s.cancelAtPeriodEnd && (s.currentPeriodEnd ?? 0) <= soon).length,
            expiringSoon: cur.filter((s) => s.cancelAtPeriodEnd && s.status === 'active' && (s.currentPeriodEnd ?? 0) <= ctx.now + 30 * 86_400).length,
            failedRecurring: cur.filter((s) => s.status === 'past_due' || s.status === 'unpaid').length,
            cancelledWithAccess: cur.filter((s) => s.cancelAtPeriodEnd && (s.status === 'active' || s.status === 'trialing')).length,
          },
          plans: plans(ctx, from, to),
          dueRenewal: list((s) => s.status === 'active' && !s.cancelAtPeriodEnd && (s.currentPeriodEnd ?? 0) <= soon),
          cancelledWithAccess: list((s) => s.cancelAtPeriodEnd && (s.status === 'active' || s.status === 'trialing')),
          planMembers: plan ? list((s) => planKey(s) === plan && ['active', 'trialing', 'past_due'].includes(s.status)) : undefined,
        });
      }
      case 'recovery': {
        const prof = await profiles(db, data);
        const custs = new Map(customerRows(data, prof).map((c) => [c.id, c]));
        const subs = new Map(data.subscriptions.map((s) => [s.id, s]));
        const rows = data.invoices.filter((i) => i.currency === ctx.cur && (i.status === 'open' || i.status === 'uncollectible') && i.attemptCount > 0)
          .map((i) => {
            const ch = data.charges.filter((c) => c.invoice === i.id && c.status === 'failed').sort((a, b) => b.created - a.created)[0];
            const s = i.subscription ? subs.get(i.subscription) : undefined; const c = i.customer ? custs.get(i.customer) : undefined;
            return { invoice: i.id, number: i.number, customer: i.customer, name: c?.name ?? null, email: c?.email ?? null, owed: i.amountRemaining || i.amountDue,
              failedAt: ch?.created ?? i.created, reason: ch?.failureMessage ?? ch?.outcomeReason ?? ch?.failureCode ?? null, attempts: i.attemptCount,
              retry: i.status === 'uncollectible' ? 'stopped' : i.nextPaymentAttempt ? 'scheduled' : 'no retry scheduled', nextRetry: i.nextPaymentAttempt,
              subscriptionStatus: s ? subStatus(s) : null, stripeUrl: `https://dashboard.stripe.com/invoices/${encodeURIComponent(i.id)}` };
          }).sort((a, b) => b.failedAt - a.failedAt);
        const failed = data.charges.filter((c) => c.currency === ctx.cur && c.status === 'failed' && c.created >= from && c.created < to)
          .map((c) => ({ id: c.id, at: c.created, customer: c.customer, name: c.customer ? custs.get(c.customer)?.name ?? null : null, email: c.customer ? custs.get(c.customer)?.email ?? null : null, amount: c.amount, reason: c.failureMessage ?? c.outcomeReason ?? c.failureCode })).sort((a, b) => b.at - a.at);
        return NextResponse.json({ ...base, needsSync, summary: recovery(ctx, from, to), outstanding: rows, failed });
      }
      case 'refunds': {
        const prof = await profiles(db, data);
        const custs = new Map(customerRows(data, prof).map((c) => [c.id, c]));
        const charges = new Map(data.charges.map((c) => [c.id, c]));
        const withCust = <T extends { charge: string | null }>(x: T) => { const ch = x.charge ? charges.get(x.charge) : undefined; const c = ch?.customer ? custs.get(ch.customer) : undefined; return { ...x, customer: ch?.customer ?? null, name: c?.name ?? null, email: c?.email ?? null, chargeAmount: ch?.amount ?? null, chargeAt: ch?.created ?? null }; };
        const refunds = data.refunds.filter((x) => x.currency === ctx.cur).sort((a, b) => b.created - a.created).map(withCust);
        const disputes = data.disputes.filter((x) => x.currency === ctx.cur).sort((a, b) => b.created - a.created).map(withCust);
        const k = kpis(ctx, from, to);
        const monthStart = Date.UTC(new Date(ctx.now * 1000).getUTCFullYear(), new Date(ctx.now * 1000).getUTCMonth(), 1) / 1000;
        const reasons: Record<string, number> = {}; for (const x of refunds) if (x.created >= from && x.created < to) reasons[x.reason ?? 'not given'] = (reasons[x.reason ?? 'not given'] ?? 0) + x.amount;
        return NextResponse.json({
          ...base, needsSync,
          summary: {
            total: refunds.filter((x) => x.status === 'succeeded').reduce((a, x) => a + x.amount, 0), period: k.refunds.amount, pct: k.refunds.pct,
            thisMonth: refunds.filter((x) => x.status === 'succeeded' && x.created >= monthStart).reduce((a, x) => a + x.amount, 0),
            pending: refunds.filter((x) => x.status === 'pending' || x.status === 'requires_action').length,
            completed: refunds.filter((x) => x.status === 'succeeded').length,
            disputesOpen: disputes.filter((x) => !['won', 'lost', 'warning_closed'].includes(x.status)).length, disputesLost: k.refunds.disputesLost,
          },
          reasons, refunds: refunds.slice(0, 500), disputes: disputes.slice(0, 500),
        });
      }
      case 'forecast':
        return NextResponse.json({ ...base, needsSync, forecast: forecast(ctx) });
      default:
        return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
    }
  } catch (err) {
    console.error('[finance] view failed', view, err);
    return NextResponse.json({ error: 'Could not compute this report' }, { status: 500 });
  }
}

function sortRows(rows: CustomerRow[], key: string, asc: boolean): CustomerRow[] {
  const k = (['ltv', 'totalPaid', 'startDate', 'nextBilling', 'lastPayment', 'name', 'price', 'payments'].includes(key) ? key : 'ltv') as keyof CustomerRow;
  return [...rows].sort((a, b) => { const x = a[k] ?? (typeof a[k] === 'string' ? '' : -Infinity), y = b[k] ?? (typeof b[k] === 'string' ? '' : -Infinity); const c = x < y ? -1 : x > y ? 1 : 0; return asc ? c : -c; });
}
function sortLedger(rows: LedgerRow[], key: string, asc: boolean): LedgerRow[] {
  const f = key === 'amount' ? (r: LedgerRow) => r.amount : key === 'status' ? (r: LedgerRow) => r.status : (r: LedgerRow) => r.at;
  return [...rows].sort((a, b) => { const x = f(a), y = f(b); const c = x < y ? -1 : x > y ? 1 : 0; return asc ? c : -c; });
}

function buildTimeline(registered: number | null, subs: { id: string; plan: string; startDate: number; trialStart: number | null; trialEnd: number | null; canceledAt: number | null; endedAt: number | null; cancelAtPeriodEnd: boolean; currentPeriodEnd: number | null; status: string }[], tx: LedgerRow[]) {
  const ev: { at: number; kind: string; label: string }[] = [];
  if (registered) ev.push({ at: registered, kind: 'registered', label: 'Registered' });
  for (const s of subs) {
    if (s.trialStart) ev.push({ at: s.trialStart, kind: 'trial', label: `Trial started · ${s.plan}` });
    ev.push({ at: s.startDate, kind: 'subscribed', label: `Subscribed · ${s.plan}` });
    if (s.cancelAtPeriodEnd && !s.endedAt && s.currentPeriodEnd) ev.push({ at: s.currentPeriodEnd, kind: 'scheduled', label: 'Cancels at period end (scheduled)' });
    if (s.endedAt) ev.push({ at: s.endedAt, kind: 'ended', label: `Subscription ended · ${s.plan}` });
  }
  const pays = tx.filter((x) => x.type !== 'refund' && x.type !== 'chargeback' && x.status !== 'failed').sort((a, b) => a.at - b.at);
  pays.forEach((x, i) => ev.push({ at: x.at, kind: i === 0 ? 'first_payment' : 'payment', label: i === 0 ? 'First payment' : x.type === 'renewal' ? 'Renewal' : 'Payment' }));
  for (const x of tx) if (x.type === 'refund') ev.push({ at: x.at, kind: 'refund', label: 'Refund' }); else if (x.status === 'failed') ev.push({ at: x.at, kind: 'failed', label: 'Payment failed' });
  // Reactivation: a subscription started after an earlier one ended.
  const ends = subs.filter((s) => s.endedAt).map((s) => s.endedAt as number);
  for (const s of subs) if (ends.some((e) => e < s.startDate)) ev.push({ at: s.startDate, kind: 'reactivated', label: 'Reactivated' });
  return ev.sort((a, b) => a.at - b.at);
}
