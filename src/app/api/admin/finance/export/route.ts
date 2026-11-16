export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/finance/export?kind=...&from=&to=&tz=&cur=   (admins only)
 * kind: transactions | customers | subscriptions | refunds | failed | summary
 *
 * CSV built on the server from the same functions the screens use, so an
 * export always matches what was on screen. Amounts are decimal major units
 * with an explicit currency column. Every export is written to the audit log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { financeRequest, profiles } from '@/lib/finance/server';
import { customerRows, kpis, ledger, plans, planKey, subStatus, forecast } from '@/lib/finance/metrics';
import { minorToDecimal } from '@/lib/finance/money';
import { audit } from '@/lib/finance/sync';
import { toCsv } from '@/lib/csv';

const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : '');

export async function GET(req: NextRequest) {
  const r = await financeRequest(req);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { ctx, from, to, data, db } = r;
  const cur = ctx.cur; const m = (v: number) => minorToDecimal(v, cur);
  const kind = req.nextUrl.searchParams.get('kind') ?? 'transactions';
  const prof = await profiles(db, data);
  const custs = new Map(customerRows(data, prof).map((c) => [c.id, c]));
  const inP = (t: number | null) => t != null && t >= from && t < to;
  let headers: string[] = []; let rows: (string | number)[][] = [];

  switch (kind) {
    case 'transactions': {
      headers = ['Date (UTC)', 'Customer', 'Email', 'Customer ID', 'Transaction ID', 'Type', 'Description', 'Amount', 'Currency', 'Status', 'Provider', 'Reference', 'Payment method', 'Failure reason'];
      rows = ledger(data).filter((x) => x.currency === cur && inP(x.at)).map((x) => { const c = x.customer ? custs.get(x.customer) : undefined; return [iso(x.at), c?.name ?? '', c?.email ?? '', x.customer ?? '', x.id, x.type, x.description, m(x.amount), cur.toUpperCase(), x.status, x.provider, x.reference ?? '', x.pm ?? '', x.failure ?? '']; });
      break;
    }
    case 'customers': {
      headers = ['Name', 'Email', 'Customer ID', 'User ID', 'Plan', 'Price', 'Billing', 'Started', 'Next billing', 'Last payment', 'Total paid', 'Refunded', 'Lifetime value (net)', 'Payments', 'Failed', 'Status', 'Payment method', 'Country', 'Cancelled', 'Currency'];
      rows = [...custs.values()].filter((c) => !c.currency || c.currency === cur).map((c) => [c.name ?? '', c.email ?? '', c.id, c.uid ?? '', c.plan ?? '', c.price != null ? m(c.price) : '', c.interval ?? '', iso(c.startDate), iso(c.nextBilling), iso(c.lastPayment), m(c.totalPaid), m(c.refunded), m(c.ltv), c.payments, c.failed, c.status, c.pm ?? '', c.country ?? '', iso(c.cancelledAt), (c.currency ?? cur).toUpperCase()]);
      break;
    }
    case 'subscriptions': {
      headers = ['Subscription ID', 'Customer', 'Email', 'Customer ID', 'Plan', 'Status', 'Price', 'Interval', 'Started', 'Current period end', 'Cancel at period end', 'Cancelled at', 'Ended at', 'Trial start', 'Trial end', 'Currency'];
      rows = data.subscriptions.filter((s) => s.items[0]?.currency === cur).map((s) => { const c = custs.get(s.customer); const it = s.items[0]; return [s.id, c?.name ?? '', c?.email ?? '', s.customer, planKey(s), subStatus(s), it ? m(it.unitAmount * it.quantity) : '', it ? `${it.intervalCount} ${it.interval}` : '', iso(s.startDate), iso(s.currentPeriodEnd), s.cancelAtPeriodEnd ? 'yes' : 'no', iso(s.canceledAt), iso(s.endedAt), iso(s.trialStart), iso(s.trialEnd), cur.toUpperCase()]; });
      break;
    }
    case 'refunds': {
      const charges = new Map(data.charges.map((c) => [c.id, c]));
      headers = ['Date (UTC)', 'Refund ID', 'Customer', 'Email', 'Original charge', 'Charge date', 'Charge amount', 'Refund amount', 'Currency', 'Status', 'Reason'];
      rows = data.refunds.filter((x) => x.currency === cur && inP(x.created)).map((x) => { const ch = x.charge ? charges.get(x.charge) : undefined; const c = ch?.customer ? custs.get(ch.customer) : undefined; return [iso(x.created), x.id, c?.name ?? '', c?.email ?? '', x.charge ?? '', iso(ch?.created), ch ? m(ch.amount) : '', m(x.amount), cur.toUpperCase(), x.status, x.reason ?? '']; });
      break;
    }
    case 'failed': {
      headers = ['Date (UTC)', 'Charge ID', 'Invoice', 'Customer', 'Email', 'Amount', 'Currency', 'Failure reason'];
      rows = data.charges.filter((c) => c.currency === cur && c.status === 'failed' && inP(c.created)).map((c) => { const cu = c.customer ? custs.get(c.customer) : undefined; return [iso(c.created), c.id, c.invoice ?? '', cu?.name ?? '', cu?.email ?? '', m(c.amount), cur.toUpperCase(), c.failureMessage ?? c.outcomeReason ?? c.failureCode ?? '']; });
      break;
    }
    case 'summary': {
      const k = kpis(ctx, from, to); const f = forecast(ctx);
      headers = ['Metric', 'Value', 'Notes'];
      const pct = (v: number | null) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
      rows = [
        ['Period', `${iso(from)} to ${iso(to)}`, `Currency ${cur.toUpperCase()}, timezone ${ctx.tz}`],
        ['Gross revenue (period)', m(k.revenue.gross), 'Succeeded charges, before Stripe fees'],
        ['Refunds (period)', m(k.refunds.amount), 'Succeeded refunds'],
        ['Disputes lost (period)', m(k.refunds.disputesLost), ''],
        ['Net collected (period)', m(k.revenue.net), 'Gross - refunds - disputes lost'],
        ['Previous period net', m(k.revenue.prevNet), 'Same length, immediately before'],
        ['Stripe fees (period)', m(k.revenue.fees), 'Where Stripe reported them in this currency'],
        ['All-time net collected', m(k.revenue.allTimeNet), ''],
        ['MRR (now)', m(Math.round(k.mrr.now)), 'Active + past-due subscriptions, trials excluded'],
        ['ARR (now)', m(Math.round(k.arr.now)), 'MRR x 12'],
        ['New / expansion / contraction / churned MRR', [k.mrr.newMrr, k.mrr.expansion, k.mrr.contraction, k.mrr.churned].map((v) => m(Math.round(v))).join(' / '), 'Expansion/contraction only from mirror start'],
        ['Paying customers (now)', k.customers.paying, `Trialing ${k.customers.trialing}, scheduled to cancel ${k.customers.scheduledCancel}`],
        ['ARPU (monthly, now)', m(Math.round(k.arpu.now)), 'MRR / paying customers'],
        ['LTV actual', m(Math.round(k.ltv.actual)), 'Net collected per customer who ever paid'],
        ['LTV estimated', k.ltv.estimate != null ? m(Math.round(k.ltv.estimate)) : 'n/a', 'ARPU / monthly churn, needs 3+ months'],
        ['Customer churn (period)', pct(k.churn.rate), `${k.churn.lost} lost, ${k.churn.retained} retained`],
        ['Revenue churn (period)', pct(k.churn.revenueRate), ''],
        ['Failed payments (period)', `${k.failed.count} / ${m(k.failed.amount)}`, `Recovered ${m(k.failed.recovered)}`],
        ['Outstanding failed invoices (now)', m(k.failed.outstanding), ''],
        ['Refund rate (period)', pct(k.refunds.pct), ''],
        ['Forecast next 30 days (expected)', m(f.revenue.expected.d30), 'Estimate, not collected revenue'],
        ['Forecast next 90 days (expected)', m(f.revenue.expected.d90), 'Estimate'],
        ['Forecast next 12 months (expected)', m(f.revenue.expected.m12), 'Estimate'],
        ...plans(ctx, from, to).map((p) => [`Plan: ${p.plan}`, m(Math.round(p.mrr)), `${p.active} active, MRR`]),
      ];
      break;
    }
    default: return NextResponse.json({ error: 'Unknown export' }, { status: 400 });
  }
  await audit(db, { uid: r.uid, action: 'finance.export', detail: { kind, from, to, currency: cur, rows: rows.length } });
  const name = `warfare-finance-${kind}-${cur}-${new Date(from * 1000).toISOString().slice(0, 10)}_${new Date(to * 1000).toISOString().slice(0, 10)}.csv`;
  return new NextResponse(toCsv(headers, rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}
