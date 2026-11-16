/**
 * Stripe object → mirror record. Pure (no I/O) so it can be unit tested with
 * plain fixtures. Only what reporting needs is kept: no card numbers, no
 * fingerprints, no billing addresses beyond country. Brand + last 4 are the
 * same thing Stripe's own receipts print.
 */
import type Stripe from 'stripe';
import type { FinCharge, FinCustomer, FinDispute, FinInvoice, FinRefund, FinSubItem, FinSubscription } from './types';

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: string }).id) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normCustomer(c: Stripe.Customer | Stripe.DeletedCustomer): FinCustomer {
  if ((c as Stripe.DeletedCustomer).deleted) return { id: c.id, email: null, name: null, country: null, uid: null, created: 0, deleted: true };
  const cu = c as Stripe.Customer;
  return {
    id: cu.id, email: cu.email ?? null, name: cu.name ?? null,
    country: cu.address?.country ?? null, uid: cu.metadata?.userId || cu.metadata?.uid || null, created: cu.created,
  };
}

export function normItem(it: Stripe.SubscriptionItem): FinSubItem | null {
  const p = it.price;
  if (!p?.recurring) return null;
  return {
    priceId: p.id, productId: idOf(p.product), nickname: p.nickname ?? null,
    unitAmount: p.unit_amount ?? Math.round(Number(p.unit_amount_decimal ?? 0)), currency: p.currency,
    interval: p.recurring.interval, intervalCount: p.recurring.interval_count || 1, quantity: it.quantity ?? 1,
  };
}

export function normSubscription(s: Stripe.Subscription): FinSubscription {
  const coupon = s.discount?.coupon;
  return {
    id: s.id, customer: idOf(s.customer) ?? '', uid: s.metadata?.userId ?? null, status: s.status,
    created: s.created, startDate: s.start_date ?? s.created,
    currentPeriodStart: num((s as { current_period_start?: number }).current_period_start),
    currentPeriodEnd: num((s as { current_period_end?: number }).current_period_end),
    cancelAtPeriodEnd: !!s.cancel_at_period_end, cancelAt: s.cancel_at ?? null, canceledAt: s.canceled_at ?? null, endedAt: s.ended_at ?? null,
    trialStart: s.trial_start ?? null, trialEnd: s.trial_end ?? null,
    items: (s.items?.data ?? []).map(normItem).filter((x): x is FinSubItem => !!x),
    discount: coupon ? {
      percentOff: coupon.percent_off ?? null, amountOff: coupon.amount_off ?? null, currency: coupon.currency ?? null,
      duration: coupon.duration, end: s.discount?.end ?? null,
    } : null,
    planId: s.metadata?.planId ?? null, planName: s.metadata?.planName ?? null, field: s.metadata?.field ?? null,
    cancelReason: s.cancellation_details?.reason ?? null, paused: !!s.pause_collection,
  };
}

export function normInvoice(i: Stripe.Invoice): FinInvoice {
  const disc = (i.total_discount_amounts ?? []).reduce((a, d) => a + (d.amount ?? 0), 0);
  return {
    id: i.id ?? '', number: i.number ?? null, customer: idOf(i.customer), subscription: idOf((i as { subscription?: unknown }).subscription),
    status: i.status ?? 'draft', billingReason: i.billing_reason ?? null, currency: i.currency,
    amountDue: i.amount_due ?? 0, amountPaid: i.amount_paid ?? 0, amountRemaining: i.amount_remaining ?? 0,
    total: i.total ?? 0, tax: (i as { tax?: number | null }).tax ?? 0, discountTotal: disc,
    attemptCount: i.attempt_count ?? 0, nextPaymentAttempt: i.next_payment_attempt ?? null,
    created: i.created, paidAt: i.status_transitions?.paid_at ?? null, charge: idOf((i as { charge?: unknown }).charge),
    priceIds: (i.lines?.data ?? []).map((l) => idOf(l.price)).filter((x): x is string => !!x),
  };
}

export function normCharge(c: Stripe.Charge): FinCharge {
  const card = c.payment_method_details?.card;
  const bt = c.balance_transaction && typeof c.balance_transaction === 'object' ? c.balance_transaction as Stripe.BalanceTransaction : null;
  return {
    id: c.id, customer: idOf(c.customer), invoice: idOf((c as { invoice?: unknown }).invoice), paymentIntent: idOf(c.payment_intent),
    amount: c.amount, amountRefunded: c.amount_refunded ?? 0, currency: c.currency,
    status: c.status === 'succeeded' ? 'succeeded' : c.status === 'failed' ? 'failed' : 'pending',
    refunded: !!c.refunded, disputed: !!c.disputed, created: c.created, description: c.description ?? null,
    failureCode: c.failure_code ?? null, failureMessage: c.failure_message ?? null, outcomeReason: c.outcome?.reason ?? null,
    pmType: c.payment_method_details?.type ?? null, pmBrand: card?.brand ?? (card?.wallet?.type ?? null), pmLast4: card?.last4 ?? null,
    country: card?.country ?? c.billing_details?.address?.country ?? null, receiptNumber: c.receipt_number ?? null,
    feeAmount: bt ? bt.fee : null, feeCurrency: bt ? bt.currency : null,
    meta: { userId: c.metadata?.userId ?? null, programId: c.metadata?.programId ?? null, kind: c.metadata?.kind ?? null },
  };
}

export function normRefund(r: Stripe.Refund): FinRefund {
  return { id: r.id, charge: idOf(r.charge), amount: r.amount, currency: r.currency, status: r.status ?? 'pending', reason: r.reason ?? null, created: r.created };
}

export function normDispute(d: Stripe.Dispute): FinDispute {
  return { id: d.id, charge: idOf(d.charge), amount: d.amount, currency: d.currency, status: d.status, reason: d.reason ?? null, created: d.created };
}

/** Normalised monthly value of one recurring item, in minor units. */
export function monthlyOfItem(it: FinSubItem): number {
  const per = it.unitAmount * it.quantity;
  const n = it.intervalCount || 1;
  switch (it.interval) {
    case 'day': return (per * 365.25) / 12 / n;
    case 'week': return (per * 52.1775) / 12 / n;
    case 'month': return per / n;
    case 'year': return per / 12 / n;
  }
}
