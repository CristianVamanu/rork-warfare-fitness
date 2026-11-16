/**
 * Financial calculations. Pure functions over the mirror (lib/finance/types),
 * always for ONE currency: a figure in GBP is never added to one in USD.
 *
 * Definitions (also in docs/FINANCE.md):
 *  - Gross revenue: amount of succeeded Stripe charges created in the period,
 *    as charged to the customer (tax-inclusive when Stripe Tax adds tax;
 *    discounts already deducted by Stripe; before Stripe fees).
 *  - Refunds: succeeded refunds created in the period (pending listed apart).
 *  - Disputes lost: disputes closed as lost, by dispute creation date.
 *  - Net collected: gross - refunds - disputes lost.
 *  - MRR: normalised monthly value of subscriptions that are paying now
 *    (active or past_due, past any trial, not paused), after an active
 *    forever/repeating discount. Trials are not MRR.
 *  - ARR: MRR x 12.  ARPU: MRR / paying customers (both "now").
 *  - Churn: a customer who was paying at the start of the period and is not
 *    paying at its end. A scheduled cancellation is NOT churn until the paid
 *    period actually ends.
 *  - LTV (actual): net collected per customer who ever paid.
 *    LTV (estimated): ARPU / monthly churn rate, only with >= 3 months of data.
 */
import type { FinCharge, FinCustomer, FinData, FinInvoice, FinStoreEvent, FinSubscription } from './types';
import { monthlyOfItem } from './normalize';

export type Gran = 'day' | 'week' | 'month' | 'year';
const DAY = 86_400;

// ---------- time (timezone-aware buckets) ----------
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ts: number, tz: string): { y: number; m: number; d: number; wd: number } {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); fmtCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const pad = (n: number) => String(n).padStart(2, '0');
export function bucketKey(ts: number, gran: Gran, tz: string): string {
  const p = parts(ts, tz);
  if (gran === 'year') return `${p.y}`;
  if (gran === 'month') return `${p.y}-${pad(p.m)}`;
  if (gran === 'day') return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  // ISO week starts Monday: step back to the local Monday's calendar date.
  const back = (p.wd + 6) % 7;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
/** Ordered bucket keys covering [from, to). */
export function bucketsBetween(from: number, to: number, gran: Gran, tz: string): string[] {
  const keys: string[] = []; const seen = new Set<string>();
  const step = gran === 'day' ? DAY / 2 : gran === 'week' ? DAY : DAY * 7;
  for (let t = from; t < to; t += step) { const k = bucketKey(t, gran, tz); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  const last = bucketKey(Math.max(from, to - 1), gran, tz); if (!seen.has(last)) keys.push(last);
  return keys;
}
export function autoGran(from: number, to: number): Gran {
  const days = (to - from) / DAY;
  return days <= 45 ? 'day' : days <= 200 ? 'week' : days <= 1100 ? 'month' : 'year';
}

// ---------- subscriptions ----------
const subCur = (s: FinSubscription) => s.items[0]?.currency ?? null;
const paidStart = (s: FinSubscription) => Math.max(s.startDate, s.trialEnd ?? 0);

/** Monthly value at time `at`, using the price in force then (price changes
 *  seen by the webhook are replayed backwards) and any discount active then. */
export function subMonthlyAt(s: FinSubscription, at: number, changes: FinData['subChanges']): number {
  let v = s.items.reduce((a, it) => a + monthlyOfItem(it), 0);
  const later = changes.filter((c) => c.subscription === s.id && c.at > at).sort((a, b) => a.at - b.at);
  if (later.length) v = later[0].fromMonthly;
  const d = s.discount;
  if (d && d.duration !== 'once' && (d.duration === 'forever' || (d.end ?? 0) > at)) {
    if (d.percentOff) v = v * (1 - d.percentOff / 100);
    else if (d.amountOff) {
      const it = s.items[0];
      const months = it ? (it.interval === 'year' ? 12 : it.interval === 'month' ? 1 : it.interval === 'week' ? 12 / 52.1775 : 12 / 365.25) * (it.intervalCount || 1) : 1;
      v = Math.max(0, v - d.amountOff / months);
    }
  }
  return Math.round(v);
}

/** Was this subscription paying (past trial, not ended) at time `at`? For
 *  "now" the live status decides; for the past the dates do. */
export function payingAt(s: FinSubscription, at: number, now: number): boolean {
  if (s.status === 'incomplete' || s.status === 'incomplete_expired') return false;
  if (at >= now - 60) return (s.status === 'active' || s.status === 'past_due') && !s.paused && paidStart(s) <= now;
  if (paidStart(s) > at) return false;
  return s.endedAt == null || s.endedAt > at;
}

export interface Ctx { data: FinData; cur: string; now: number; tz: string }

export function mrrAt(ctx: Ctx, at: number): { mrr: number; customers: Set<string> } {
  let mrr = 0; const customers = new Set<string>();
  for (const s of ctx.data.subscriptions) {
    if (subCur(s) !== ctx.cur || !payingAt(s, at, ctx.now)) continue;
    const v = subMonthlyAt(s, at, ctx.data.subChanges);
    if (v <= 0) continue;
    mrr += v; customers.add(s.customer);
  }
  return { mrr, customers };
}

// ---------- charges ----------
export type TxKind = 'initial' | 'renewal' | 'plan_change' | 'one_time' | 'refund' | 'failed' | 'chargeback';
export function chargeKind(c: FinCharge, inv: Map<string, FinInvoice>): TxKind {
  if (c.status === 'failed') return 'failed';
  const i = c.invoice ? inv.get(c.invoice) : undefined;
  if (!i || !i.subscription) return 'one_time';
  if (i.billingReason === 'subscription_create') return 'initial';
  if (i.billingReason === 'subscription_update') return 'plan_change';
  return 'renewal';
}
const inRange = (t: number, from: number, to: number) => t >= from && t < to;

export interface PeriodTotals { gross: number; refunds: number; refundsPending: number; disputesLost: number; net: number; fees: number; count: number; subscription: number; oneTime: number }
export function periodTotals(ctx: Ctx, from: number, to: number): PeriodTotals {
  const { data, cur } = ctx; const inv = new Map(data.invoices.map((i) => [i.id, i]));
  let gross = 0, fees = 0, count = 0, subscription = 0, oneTime = 0;
  for (const c of data.charges) {
    if (c.currency !== cur || c.status !== 'succeeded' || !inRange(c.created, from, to)) continue;
    gross += c.amount; count++;
    if (c.feeAmount != null && c.feeCurrency === cur) fees += c.feeAmount;
    if (chargeKind(c, inv) === 'one_time') oneTime += c.amount; else subscription += c.amount;
  }
  let refunds = 0, refundsPending = 0;
  for (const r of data.refunds) {
    if (r.currency !== cur || !inRange(r.created, from, to)) continue;
    if (r.status === 'succeeded') refunds += r.amount; else if (r.status === 'pending' || r.status === 'requires_action') refundsPending += r.amount;
  }
  let disputesLost = 0;
  for (const d of data.disputes) if (d.currency === cur && d.status === 'lost' && inRange(d.created, from, to)) disputesLost += d.amount;
  return { gross, refunds, refundsPending, disputesLost, net: gross - refunds - disputesLost, fees, count, subscription, oneTime };
}

// ---------- churn ----------
export function churnBetween(ctx: Ctx, from: number, to: number) {
  const start = mrrAt(ctx, from), end = mrrAt(ctx, Math.min(to, ctx.now));
  let lost = 0; for (const c of start.customers) if (!end.customers.has(c)) lost++;
  const startN = start.customers.size;
  // MRR movements
  let newMrr = 0, churnedMrr = 0, expansion = 0, contraction = 0, newCustomers = 0;
  const seenNew = new Set<string>();
  for (const s of ctx.data.subscriptions) {
    if (subCur(s) !== ctx.cur) continue;
    const ps = paidStart(s);
    if (inRange(ps, from, to) && s.status !== 'incomplete' && s.status !== 'incomplete_expired' && (s.endedAt == null || s.endedAt > ps)) {
      newMrr += subMonthlyAt(s, ps, ctx.data.subChanges);
      if (!start.customers.has(s.customer) && !seenNew.has(s.customer)) { seenNew.add(s.customer); newCustomers++; }
    }
    if (s.endedAt != null && inRange(s.endedAt, from, to) && ps < s.endedAt) churnedMrr += subMonthlyAt(s, s.endedAt - 1, ctx.data.subChanges);
  }
  for (const ch of ctx.data.subChanges) {
    if (ch.currency !== ctx.cur || !inRange(ch.at, from, to)) continue;
    const d = ch.toMonthly - ch.fromMonthly; if (d > 0) expansion += d; else contraction -= d;
  }
  return {
    startMrr: start.mrr, endMrr: end.mrr, startCustomers: startN, endCustomers: end.customers.size,
    lost, retained: startN - lost, rate: startN ? lost / startN : null,
    revenueRate: start.mrr ? churnedMrr / start.mrr : null,
    newMrr, churnedMrr, expansion, contraction, newCustomers,
  };
}

/** Average monthly customer churn over up to the last 6 complete months. */
export function monthlyChurn(ctx: Ctx): { rate: number | null; months: number; exposure: number } {
  const rates: number[] = []; let exposure = 0;
  for (let k = 1; k <= 6; k++) {
    const to = ctx.now - (k - 1) * 30.4375 * DAY, from = to - 30.4375 * DAY;
    const c = churnBetween(ctx, from, to);
    if (c.startCustomers > 0) { rates.push(c.rate ?? 0); exposure += c.startCustomers; }
  }
  return { rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null, months: rates.length, exposure };
}

// ---------- KPIs ----------
export function kpis(ctx: Ctx, from: number, to: number) {
  const len = to - from;
  const cur = periodTotals(ctx, from, to), prev = periodTotals(ctx, from - len, from), all = periodTotals(ctx, 0, ctx.now + DAY);
  const nowM = mrrAt(ctx, ctx.now), prevM = mrrAt(ctx, Math.max(0, Math.min(from, ctx.now)));
  const ch = churnBetween(ctx, from, to);
  const trialing = ctx.data.subscriptions.filter((s) => subCur(s) === ctx.cur && s.status === 'trialing').length;
  const scheduled = ctx.data.subscriptions.filter((s) => subCur(s) === ctx.cur && s.cancelAtPeriodEnd && (s.status === 'active' || s.status === 'past_due')).length;
  const paying = nowM.customers.size;
  const arpu = paying ? nowM.mrr / paying : 0, prevArpu = prevM.customers.size ? prevM.mrr / prevM.customers.size : 0;
  // LTV
  const perCust = new Map<string, number>();
  for (const c of ctx.data.charges) if (c.currency === ctx.cur && c.status === 'succeeded' && c.customer) perCust.set(c.customer, (perCust.get(c.customer) ?? 0) + c.amount);
  const chargeCust = new Map(ctx.data.charges.map((c) => [c.id, c.customer]));
  for (const r of ctx.data.refunds) { const cu = r.charge ? chargeCust.get(r.charge) : null; if (cu && r.currency === ctx.cur && r.status === 'succeeded') perCust.set(cu, (perCust.get(cu) ?? 0) - r.amount); }
  const everPaid = perCust.size;
  const ltvActual = everPaid ? [...perCust.values()].reduce((a, b) => a + b, 0) / everPaid : 0;
  const mc = monthlyChurn(ctx);
  const ltvEstimate = mc.rate && mc.rate > 0 && mc.months >= 3 && mc.exposure >= 20 ? Math.min(arpu / mc.rate, arpu * 60) : null;
  // failed / recovery
  const fail = recovery(ctx, from, to);
  return {
    revenue: { gross: cur.gross, net: cur.net, prevGross: prev.gross, prevNet: prev.net, allTimeGross: all.gross, allTimeNet: all.net, fees: cur.fees, count: cur.count },
    mrr: { now: nowM.mrr, atStart: prevM.mrr, newMrr: ch.newMrr, expansion: ch.expansion, contraction: ch.contraction, churned: ch.churnedMrr },
    arr: { now: nowM.mrr * 12, atStart: prevM.mrr * 12 },
    customers: { paying, atStart: prevM.customers.size, newPaying: ch.newCustomers, scheduledCancel: scheduled, trialing, everPaid },
    arpu: { now: arpu, atStart: prevArpu },
    ltv: { actual: ltvActual, estimate: ltvEstimate, churnMonths: mc.months },
    churn: { rate: ch.rate, revenueRate: ch.revenueRate, lost: ch.lost, retained: ch.retained, monthly: mc.rate },
    failed: { count: fail.failedCount, amount: fail.failedAmount, recovered: fail.recoveredAmount, recoveredCount: fail.recoveredCount, outstanding: fail.outstanding, rate: fail.rate },
    refunds: { amount: cur.refunds, pending: cur.refundsPending, pct: cur.gross ? cur.refunds / cur.gross : null, disputesLost: cur.disputesLost, prev: prev.refunds },
  };
}

export function recovery(ctx: Ctx, from: number, to: number) {
  let failedCount = 0, failedAmount = 0;
  for (const c of ctx.data.charges) if (c.currency === ctx.cur && c.status === 'failed' && inRange(c.created, from, to)) { failedCount++; failedAmount += c.amount; }
  let recoveredAmount = 0, recoveredCount = 0, outstanding = 0, awaitingRetry = 0, lostAmount = 0;
  const affected = new Set<string>();
  for (const i of ctx.data.invoices) {
    if (i.currency !== ctx.cur) continue;
    if (i.status === 'paid' && i.attemptCount > 1 && i.paidAt != null && inRange(i.paidAt, from, to)) { recoveredAmount += i.amountPaid; recoveredCount++; }
    if (i.status === 'open' && i.attemptCount > 0 && i.amountRemaining > 0) { outstanding += i.amountRemaining; if (i.customer) affected.add(i.customer); if (i.nextPaymentAttempt) awaitingRetry++; }
    if (i.status === 'uncollectible' && inRange(i.created, from, to)) lostAmount += i.amountRemaining || i.amountDue;
  }
  const denom = recoveredAmount + outstanding + lostAmount;
  return { failedCount, failedAmount, recoveredAmount, recoveredCount, outstanding, awaitingRetry, affected: affected.size, lostAmount, rate: denom ? recoveredAmount / denom : null };
}

// ---------- series ----------
export function revenueSeries(ctx: Ctx, from: number, to: number, gran: Gran) {
  const keys = bucketsBetween(from, to, gran, ctx.tz); const len = to - from;
  const prevKeys = bucketsBetween(from - len, from, gran, ctx.tz);
  const row = () => ({ gross: 0, refunds: 0, net: 0, prevNet: 0, succeeded: 0, failed: 0, pending: 0, refunded: 0, subscription: 0, oneTime: 0 });
  const m = new Map(keys.map((k) => [k, row()])); const pm = new Map(prevKeys.map((k) => [k, 0]));
  const inv = new Map(ctx.data.invoices.map((i) => [i.id, i]));
  for (const c of ctx.data.charges) {
    if (c.currency !== ctx.cur) continue;
    if (inRange(c.created, from, to)) {
      const r = m.get(bucketKey(c.created, gran, ctx.tz)); if (!r) continue;
      if (c.status === 'succeeded') { r.gross += c.amount; r.net += c.amount; r.succeeded++; if (chargeKind(c, inv) === 'one_time') r.oneTime += c.amount; else r.subscription += c.amount; }
      else if (c.status === 'failed') r.failed++; else r.pending++;
    } else if (c.status === 'succeeded' && inRange(c.created, from - len, from)) {
      const k = bucketKey(c.created, gran, ctx.tz); if (pm.has(k)) pm.set(k, pm.get(k)! + c.amount);
    }
  }
  for (const rf of ctx.data.refunds) {
    if (rf.currency !== ctx.cur || rf.status !== 'succeeded') continue;
    if (inRange(rf.created, from, to)) { const r = m.get(bucketKey(rf.created, gran, ctx.tz)); if (r) { r.refunds += rf.amount; r.net -= rf.amount; r.refunded++; } }
    else if (inRange(rf.created, from - len, from)) { const k = bucketKey(rf.created, gran, ctx.tz); if (pm.has(k)) pm.set(k, pm.get(k)! - rf.amount); }
  }
  const pv = prevKeys.map((k) => pm.get(k) ?? 0);
  return keys.map((k, i) => ({ key: k, ...m.get(k)!, prevNet: pv[i] ?? 0 }));
}

/** End-of-bucket MRR with movements, plus customer growth, per bucket. */
export function mrrSeries(ctx: Ctx, from: number, to: number, gran: Gran, signups: number[] = []) {
  const keys = bucketsBetween(from, to, gran, ctx.tz);
  // bucket edges: first timestamp of each bucket
  const edges: number[] = []; let prev = '';
  const step = gran === 'day' ? 3600 : DAY;
  for (let t = from; t < to; t += step) { const k = bucketKey(t, gran, ctx.tz); if (k !== prev) { edges.push(t); prev = k; } }
  edges.push(to);
  return keys.map((k, i) => {
    const a = edges[i] ?? from, b = edges[i + 1] ?? to;
    const c = churnBetween(ctx, a, b);
    return {
      key: k, mrr: c.endMrr, newMrr: c.newMrr, expansion: c.expansion, contraction: -c.contraction, churned: -c.churnedMrr,
      net: c.newMrr + c.expansion - c.contraction - c.churnedMrr,
      paying: c.endCustomers, newPaying: c.newCustomers, cancelled: c.lost, netCustomers: c.newCustomers - c.lost,
      signups: signups.filter((t) => t >= a && t < b).length, arpu: c.endCustomers ? c.endMrr / c.endCustomers : 0,
    };
  });
}

// ---------- plans ----------
export function planKey(s: FinSubscription): string { return s.planName || s.items[0]?.nickname || s.items[0]?.priceId || 'Unknown plan'; }
export function plans(ctx: Ctx, from: number, to: number) {
  const m = new Map<string, { plan: string; price: number; interval: string; active: number; mrr: number; newSubs: number; cancels: number; atStart: number; priceIds: Set<string> }>();
  for (const s of ctx.data.subscriptions) {
    if (subCur(s) !== ctx.cur) continue;
    const k = planKey(s); const it = s.items[0];
    if (!m.has(k)) m.set(k, { plan: k, price: it ? it.unitAmount * it.quantity : 0, interval: it ? `${it.intervalCount > 1 ? it.intervalCount + ' ' : ''}${it.interval}` : '', active: 0, mrr: 0, newSubs: 0, cancels: 0, atStart: 0, priceIds: new Set() });
    const r = m.get(k)!; if (it) r.priceIds.add(it.priceId);
    if (payingAt(s, ctx.now, ctx.now)) { r.active++; r.mrr += subMonthlyAt(s, ctx.now, ctx.data.subChanges); }
    if (inRange(s.created, from, to)) r.newSubs++;
    if (s.endedAt != null && inRange(s.endedAt, from, to)) r.cancels++;
    if (payingAt(s, from, ctx.now)) r.atStart++;
  }
  const totalActive = [...m.values()].reduce((a, r) => a + r.active, 0);
  return [...m.values()].map((r) => ({ ...r, priceIds: [...r.priceIds], arr: r.mrr * 12, share: totalActive ? r.active / totalActive : 0, churnRate: r.atStart ? r.cancels / r.atStart : null }))
    .sort((a, b) => b.mrr - a.mrr);
}

// ---------- cohorts ----------
export function cohorts(ctx: Ctx, months = 12) {
  const first = new Map<string, number>();
  for (const s of ctx.data.subscriptions) {
    if (subCur(s) !== ctx.cur || s.status === 'incomplete' || s.status === 'incomplete_expired') continue;
    const ps = paidStart(s); if (ps > ctx.now) continue;
    if (!first.has(s.customer) || ps < first.get(s.customer)!) first.set(s.customer, ps);
  }
  const byCohort = new Map<string, string[]>();
  for (const [c, t] of first) { const k = bucketKey(t, 'month', ctx.tz); byCohort.set(k, [...(byCohort.get(k) ?? []), c]); }
  const keys = [...byCohort.keys()].sort().slice(-months);
  const subsBy = new Map<string, FinSubscription[]>();
  for (const s of ctx.data.subscriptions) if (subCur(s) === ctx.cur) subsBy.set(s.customer, [...(subsBy.get(s.customer) ?? []), s]);
  return keys.map((k) => {
    const custs = byCohort.get(k)!; const [y, mo] = k.split('-').map(Number);
    const cells: (number | null)[] = [];
    for (let i = 0; i < months; i++) {
      const end = Date.UTC(y, mo - 1 + i + 1, 1) / 1000 - 1;
      if (end > ctx.now + 31 * DAY) { cells.push(null); continue; }
      const at = Math.min(end, ctx.now);
      const kept = custs.filter((c) => (subsBy.get(c) ?? []).some((s) => payingAt(s, at, ctx.now))).length;
      cells.push(custs.length ? kept / custs.length : null);
    }
    return { cohort: k, size: custs.length, cells };
  });
}

// ---------- forecast ----------
export function forecast(ctx: Ctx, defaults = { churn: 0.05, trialConversion: 0.5, pastDueRecovery: 0.5 }) {
  const mc = monthlyChurn(ctx);
  // Measured churn is used only with enough history (3+ months, 20+
  // customer-months); a handful of customers with no cancellations yet must
  // not turn into "everybody renews". Never below 1%/month.
  const observed = mc.rate != null && mc.months >= 3 && mc.exposure >= 20;
  const base = Math.max(0.01, observed ? (mc.rate as number) : defaults.churn);
  // Trial conversion from trials that already ended.
  const ended = ctx.data.subscriptions.filter((s) => subCur(s) === ctx.cur && s.trialEnd != null && s.trialEnd < ctx.now);
  const converted = ended.filter((s) => ctx.data.invoices.some((i) => i.subscription === s.id && i.status === 'paid' && i.amountPaid > 0)).length;
  const trialObserved = ended.length >= 5;
  const trialConv = trialObserved ? converted / ended.length : defaults.trialConversion;
  const scenarios = { conservative: Math.min(0.9, Math.max(base * 1.5, base + 0.02)), expected: base, optimistic: base * 0.5 };
  const horizons = { d30: 30 * DAY, d90: 90 * DAY, m12: 365 * DAY };
  const out: Record<string, Record<string, number>> = {};
  const renewals: Record<string, number> = { d30: 0, d90: 0, m12: 0 };
  for (const [sc, churn] of Object.entries(scenarios)) {
    const r: Record<string, number> = { d30: 0, d90: 0, m12: 0 };
    for (const s of ctx.data.subscriptions) {
      if (subCur(s) !== ctx.cur || s.cancelAtPeriodEnd || !['active', 'trialing', 'past_due'].includes(s.status) || s.paused) continue;
      const it = s.items[0]; if (!it) continue;
      const amt = s.items.reduce((a, x) => a + x.unitAmount * x.quantity, 0) * discountFactor(s);
      const periodSec = (it.interval === 'year' ? 365.25 : it.interval === 'month' ? 30.4375 : it.interval === 'week' ? 7 : 1) * DAY * (it.intervalCount || 1);
      let next = s.status === 'trialing' ? (s.trialEnd ?? s.currentPeriodEnd ?? ctx.now) : (s.currentPeriodEnd ?? ctx.now);
      const p0 = s.status === 'trialing' ? trialConv : s.status === 'past_due' ? defaults.pastDueRecovery : 1;
      for (let n = 0; n < 400 && next <= ctx.now + horizons.m12; n++, next += periodSec) {
        if (next < ctx.now) continue;
        const monthsOut = (next - ctx.now) / (30.4375 * DAY);
        const w = p0 * Math.pow(1 - churn, monthsOut);
        for (const [h, len] of Object.entries(horizons)) if (next <= ctx.now + len) { r[h] += amt * w; if (sc === 'expected') renewals[h] += w; }
      }
    }
    out[sc] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]));
  }
  const mrr = mrrAt(ctx, ctx.now).mrr;
  const projected = Object.fromEntries(Object.entries(scenarios).map(([k, c]) => [k, { mrr3: Math.round(mrr * Math.pow(1 - c, 3)), mrr12: Math.round(mrr * Math.pow(1 - c, 12)) }]));
  return {
    revenue: out, renewals: Object.fromEntries(Object.entries(renewals).map(([k, v]) => [k, Math.round(v)])),
    projected, mrr, arr: mrr * 12,
    assumptions: { churn: scenarios, churnObserved: observed, churnMonths: mc.months, churnExposure: mc.exposure, trialConversion: trialConv, trialObserved, pastDueRecovery: defaults.pastDueRecovery },
    note: 'Estimates based on active subscriptions, their billing intervals and renewal dates, discounted by churn. Not collected revenue. New sign-ups are not included.',
  };
}
function discountFactor(s: FinSubscription): number {
  const d = s.discount; if (!d || d.duration === 'once') return 1;
  if (d.percentOff) return 1 - d.percentOff / 100;
  if (d.amountOff) { const base = s.items.reduce((a, x) => a + x.unitAmount * x.quantity, 0); return base ? Math.max(0, base - d.amountOff) / base : 1; }
  return 1;
}

// ---------- customers ----------
export type CustStatus = 'active' | 'cancelling' | 'trial' | 'past_due' | 'payment_failed' | 'cancelled' | 'expired' | 'incomplete' | 'paused' | 'one_time';
export function subStatus(s: FinSubscription): CustStatus {
  if (s.paused) return 'paused';
  switch (s.status) {
    case 'active': return s.cancelAtPeriodEnd ? 'cancelling' : 'active';
    case 'trialing': return 'trial';
    case 'past_due': return 'past_due';
    case 'unpaid': return 'payment_failed';
    case 'incomplete': return 'incomplete';
    case 'incomplete_expired': return 'expired';
    case 'paused': return 'paused';
    // Ran to the end of a paid period it was set to stop at = expired;
    // stopped there and then = cancelled.
    default: return s.cancelAtPeriodEnd ? 'expired' : 'cancelled';
  }
}
const STATUS_RANK: CustStatus[] = ['past_due', 'payment_failed', 'active', 'cancelling', 'trial', 'paused', 'incomplete', 'cancelled', 'expired', 'one_time'];

export interface CustomerRow {
  id: string; uid: string | null; name: string | null; email: string | null; country: string | null; currency: string | null;
  plan: string | null; price: number | null; interval: string | null; startDate: number | null; nextBilling: number | null;
  lastPayment: number | null; totalPaid: number; refunded: number; payments: number; failed: number; ltv: number;
  status: CustStatus; pm: string | null; cancelledAt: number | null; subscriptionId: string | null;
}
export function customerRows(data: FinData, profiles: Map<string, { name?: string | null; email?: string | null }> = new Map()): CustomerRow[] {
  const subsBy = new Map<string, FinSubscription[]>(); for (const s of data.subscriptions) subsBy.set(s.customer, [...(subsBy.get(s.customer) ?? []), s]);
  const chBy = new Map<string, FinCharge[]>(); for (const c of data.charges) if (c.customer) chBy.set(c.customer, [...(chBy.get(c.customer) ?? []), c]);
  const chargeCust = new Map(data.charges.map((c) => [c.id, c.customer]));
  const refBy = new Map<string, number>();
  for (const r of data.refunds) { const cu = r.charge ? chargeCust.get(r.charge) : null; if (cu && r.status === 'succeeded') refBy.set(cu, (refBy.get(cu) ?? 0) + r.amount); }
  const custs = new Map<string, FinCustomer>(data.customers.map((c) => [c.id, c]));
  const ids = new Set<string>([...subsBy.keys(), ...chBy.keys()]);
  const rows: CustomerRow[] = [];
  for (const id of ids) {
    const subs = (subsBy.get(id) ?? []).sort((a, b) => STATUS_RANK.indexOf(subStatus(a)) - STATUS_RANK.indexOf(subStatus(b)) || b.created - a.created);
    const ch = (chBy.get(id) ?? []).sort((a, b) => b.created - a.created);
    const ok = ch.filter((c) => c.status === 'succeeded');
    if (!subs.length && !ok.length) continue; // only failed attempts, never paid and never subscribed
    const s = subs[0]; const it = s?.items[0]; const cu = custs.get(id);
    const uid = cu?.uid ?? s?.uid ?? ok[0]?.meta.userId ?? null; const prof = uid ? profiles.get(uid) : undefined;
    const currency = it?.currency ?? ok[0]?.currency ?? null;
    const totalPaid = ok.filter((c) => c.currency === currency).reduce((a, c) => a + c.amount, 0);
    const refunded = refBy.get(id) ?? 0;
    const last = ok[0];
    rows.push({
      id, uid, name: cu?.name || prof?.name || null, email: cu?.email || prof?.email || null, country: cu?.country ?? last?.country ?? null, currency,
      plan: s ? planKey(s) : (last?.description ?? 'One-time purchase'), price: it ? it.unitAmount * it.quantity : null,
      interval: it ? `${it.intervalCount > 1 ? it.intervalCount + ' ' : ''}${it.interval}` : null,
      startDate: subs.length ? Math.min(...subs.map((x) => x.startDate)) : (ok.length ? ok[ok.length - 1].created : null),
      nextBilling: s && (s.status === 'active' || s.status === 'past_due' || s.status === 'trialing') && !s.cancelAtPeriodEnd ? (s.status === 'trialing' ? s.trialEnd : s.currentPeriodEnd) : null,
      lastPayment: last?.created ?? null, totalPaid, refunded, payments: ok.length, failed: ch.filter((c) => c.status === 'failed').length,
      ltv: totalPaid - refunded, status: s ? subStatus(s) : 'one_time',
      pm: last?.pmBrand ? `${last.pmBrand}${last.pmLast4 ? ' •••• ' + last.pmLast4 : ''}` : last?.pmType ?? null,
      cancelledAt: s?.canceledAt ?? null, subscriptionId: s?.id ?? null,
    });
  }
  return rows;
}

// ---------- ledger ----------
export interface LedgerRow {
  id: string; at: number; customer: string | null; type: TxKind; description: string; amount: number; currency: string;
  status: string; provider: 'stripe' | 'google_play'; reference: string | null; pm: string | null; failure: string | null; chargeId: string | null; refundedAmount: number;
}
export function ledger(data: FinData): LedgerRow[] {
  const inv = new Map(data.invoices.map((i) => [i.id, i]));
  const subs = new Map(data.subscriptions.map((s) => [s.id, s]));
  const chargeById = new Map(data.charges.map((c) => [c.id, c]));
  const rows: LedgerRow[] = [];
  for (const c of data.charges) {
    const k = chargeKind(c, inv); const i = c.invoice ? inv.get(c.invoice) : undefined; const s = i?.subscription ? subs.get(i.subscription) : undefined;
    const label = { initial: 'First subscription payment', renewal: 'Subscription renewal', plan_change: 'Plan change', one_time: 'One-time payment', failed: 'Failed payment', refund: 'Refund', chargeback: 'Chargeback' }[k];
    rows.push({
      id: c.id, at: c.created, customer: c.customer, type: k, description: `${label}${s ? ' · ' + planKey(s) : c.description ? ' · ' + c.description : ''}`,
      amount: c.amount, currency: c.currency, status: c.status === 'succeeded' ? (c.refunded ? 'refunded' : c.amountRefunded ? 'partially_refunded' : c.disputed ? 'disputed' : 'succeeded') : c.status,
      provider: 'stripe', reference: i?.number ?? c.receiptNumber ?? c.paymentIntent, pm: c.pmBrand ? `${c.pmBrand}${c.pmLast4 ? ' •••• ' + c.pmLast4 : ''}` : c.pmType,
      failure: c.status === 'failed' ? (c.failureMessage || c.outcomeReason || c.failureCode) : null, chargeId: c.id, refundedAmount: c.amountRefunded,
    });
  }
  for (const r of data.refunds) {
    const c = r.charge ? chargeById.get(r.charge) : undefined;
    rows.push({ id: r.id, at: r.created, customer: c?.customer ?? null, type: 'refund', description: `Refund${r.reason ? ' · ' + r.reason.replace(/_/g, ' ') : ''}`, amount: -r.amount, currency: r.currency, status: r.status, provider: 'stripe', reference: r.charge, pm: null, failure: null, chargeId: r.charge, refundedAmount: 0 });
  }
  for (const d of data.disputes) {
    const c = d.charge ? chargeById.get(d.charge) : undefined;
    rows.push({ id: d.id, at: d.created, customer: c?.customer ?? null, type: 'chargeback', description: `Dispute${d.reason ? ' · ' + d.reason.replace(/_/g, ' ') : ''}`, amount: -d.amount, currency: d.currency, status: d.status, provider: 'stripe', reference: d.charge, pm: null, failure: null, chargeId: d.charge, refundedAmount: 0 });
  }
  return rows.sort((a, b) => b.at - a.at);
}

export function storeTotals(events: FinStoreEvent[], cur: string, from: number, to: number) {
  let gross = 0, count = 0;
  for (const e of events) if (e.currency === cur && e.amount != null && e.environment !== 'SANDBOX' && inRange(e.at, from, to)) { gross += e.amount; count++; }
  return { gross, count };
}

export function currenciesIn(data: FinData): string[] {
  const tally = new Map<string, number>();
  for (const c of data.charges) if (c.status === 'succeeded') tally.set(c.currency, (tally.get(c.currency) ?? 0) + c.amount);
  for (const s of data.subscriptions) { const c = s.items[0]?.currency; if (c && !tally.has(c)) tally.set(c, 0); }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
