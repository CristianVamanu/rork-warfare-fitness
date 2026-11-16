/**
 * Keeps the financial mirror in step with Stripe (server only).
 *
 *  - syncFromStripe: backfill (full) or catch-up (since the last sync, with a
 *    week of overlap because charges and invoices change after creation).
 *  - mirrorStripeEvent: called by the webhook after its own handling, so the
 *    mirror is live between syncs. Never throws into the webhook.
 *  - recordStoreEvent: Google Play purchases from the RevenueCat webhook.
 *  - loadFinData: reads the mirror, cached per server instance until the
 *    mirror's version number changes.
 *
 * All writes are keyed by provider id (set, not add), so any of these can run
 * twice, overlap or be retried without creating a duplicate.
 */
import type Stripe from 'stripe';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { FIN, type FinData, type FinMeta, type FinStoreEvent, type FinSubChange } from './types';
import { monthlyOfItem, normCharge, normCustomer, normDispute, normInvoice, normRefund, normSubscription } from './normalize';
import { toMinor } from './money';

type Rec = { id: string };

async function writeAll(db: Firestore, col: string, recs: Rec[]): Promise<void> {
  for (let i = 0; i < recs.length; i += 400) {
    const b = db.batch();
    for (const r of recs.slice(i, i + 400)) b.set(db.collection(col).doc(r.id), r);
    await b.commit();
  }
}

async function bumpVersion(db: Firestore, patch: Partial<FinMeta> = {}): Promise<void> {
  await db.collection(FIN.meta).doc('state').set({ ...patch, version: FieldValue.increment(1) }, { merge: true });
}

export async function getMeta(db: Firestore): Promise<FinMeta> {
  const d = (await db.collection(FIN.meta).doc('state').get()).data() ?? {};
  return {
    version: Number(d.version ?? 0), lastSyncAt: d.lastSyncAt ?? null, lastFullSyncAt: d.lastFullSyncAt ?? null,
    mirrorSince: d.mirrorSince ?? null, storeLedgerSince: d.storeLedgerSince ?? null, lastError: d.lastError ?? null,
  };
}

const WEEK = 7 * 86_400;

export async function syncFromStripe(db: Firestore, stripe: Stripe, opts: { full?: boolean } = {}): Promise<{ counts: Record<string, number>; full: boolean }> {
  const meta = await getMeta(db);
  const full = !!opts.full || !meta.lastFullSyncAt;
  const since = full ? undefined : Math.max(0, (meta.lastSyncAt ?? 0) - WEEK);
  const created = since ? { gte: since } : undefined;
  const counts: Record<string, number> = {};
  const startedAt = Math.floor(Date.now() / 1000);
  try {
    const collect = async <T, R extends Rec>(it: AsyncIterable<T>, norm: (x: T) => R, col: string, key = col) => {
      const out: R[] = [];
      for await (const x of it) out.push(norm(x));
      await writeAll(db, col, out);
      counts[key] = (counts[key] ?? 0) + out.length;
    };
    // Customers change rarely and are few: always the full list.
    await collect(stripe.customers.list({ limit: 100 }), normCustomer, FIN.customers);
    // Subscriptions: every status, every time. Status and period dates move
    // without new objects being created, and the list is small.
    await collect(stripe.subscriptions.list({ status: 'all', limit: 100 }), normSubscription, FIN.subscriptions);
    await collect(stripe.charges.list({ limit: 100, created, expand: ['data.balance_transaction'] }), normCharge, FIN.charges);
    await collect(stripe.invoices.list({ limit: 100, created }), normInvoice, FIN.invoices);
    // Open invoices older than the window still change (retries, recovery).
    if (!full) await collect(stripe.invoices.list({ limit: 100, status: 'open' }), normInvoice, FIN.invoices, 'openInvoicesRefreshed');
    await collect(stripe.refunds.list({ limit: 100, created }), normRefund, FIN.refunds);
    await collect(stripe.disputes.list({ limit: 100, created }), normDispute, FIN.disputes);
    await bumpVersion(db, {
      lastSyncAt: startedAt, lastError: null,
      ...(full ? { lastFullSyncAt: startedAt } : {}),
      ...(meta.mirrorSince ? {} : { mirrorSince: startedAt }),
    });
    return { counts, full };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.collection(FIN.meta).doc('state').set({ lastError: msg }, { merge: true }).catch(() => {});
    throw err;
  }
}

/** Mirror the object carried by a webhook event. Swallows its own errors. */
export async function mirrorStripeEvent(db: Firestore, event: Stripe.Event): Promise<void> {
  try {
    const o = event.data.object as unknown;
    const t = event.type;
    let col: string | null = null; let rec: Rec | null = null;
    if (t.startsWith('customer.subscription.')) {
      const sub = normSubscription(o as Stripe.Subscription);
      col = FIN.subscriptions; rec = sub;
      // Expansion / contraction: Stripe sends the old items in previous_attributes.
      const prev = (event.data.previous_attributes as { items?: { data?: Stripe.SubscriptionItem[] } } | undefined)?.items?.data;
      if (t === 'customer.subscription.updated' && prev?.length) {
        const before = prev.map((it) => (it.price?.recurring ? monthlyOfItem({
          priceId: it.price.id, productId: null, nickname: null, unitAmount: it.price.unit_amount ?? 0, currency: it.price.currency,
          interval: it.price.recurring.interval, intervalCount: it.price.recurring.interval_count || 1, quantity: it.quantity ?? 1,
        }) : 0)).reduce((a, b) => a + b, 0);
        const after = sub.items.reduce((a, it) => a + monthlyOfItem(it), 0);
        if (Math.round(before) !== Math.round(after)) {
          const ch: FinSubChange = { id: event.id, subscription: sub.id, customer: sub.customer, at: event.created, fromMonthly: Math.round(before), toMonthly: Math.round(after), currency: sub.items[0]?.currency ?? 'usd' };
          await db.collection(FIN.subChanges).doc(ch.id).set(ch);
        }
      }
    } else if (t.startsWith('invoice.')) { col = FIN.invoices; rec = normInvoice(o as Stripe.Invoice); }
    else if (t.startsWith('charge.dispute.')) { col = FIN.disputes; rec = normDispute(o as Stripe.Dispute); }
    else if (t.startsWith('charge.refund.')) { col = FIN.refunds; rec = normRefund(o as Stripe.Refund); }
    else if (t.startsWith('charge.')) {
      col = FIN.charges; rec = normCharge(o as Stripe.Charge);
      // charge.refunded carries the refunds list; mirror those too.
      const refunds = (o as Stripe.Charge).refunds?.data ?? [];
      if (refunds.length) await writeAll(db, FIN.refunds, refunds.map(normRefund));
    } else if (t.startsWith('customer.') && !t.includes('discount') && !t.includes('source') && !t.includes('tax_id')) {
      col = FIN.customers; rec = normCustomer(o as Stripe.Customer);
    }
    if (!col || !rec || !rec.id) return;
    await db.collection(col).doc(rec.id).set(rec);
    await bumpVersion(db);
  } catch (err) {
    console.error('[finance] mirror failed for', event.type, event.id, err);
  }
}

/** RevenueCat event → Google Play ledger row (purchases and renewals only). */
export interface RcMoneyEvent {
  id?: string; type?: string; app_user_id?: string; product_id?: string; price_in_purchased_currency?: number | null;
  currency?: string | null; store?: string; environment?: string; transaction_id?: string | null;
  event_timestamp_ms?: number; purchased_at_ms?: number | null; expiration_at_ms?: number | null; period_type?: string | null;
}
export function storeEventFrom(e: RcMoneyEvent): FinStoreEvent | null {
  if (!e.id || !e.type) return null;
  const money = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'UNCANCELLATION'];
  if (!money.includes(e.type)) return null;
  const cur = e.currency ? e.currency.toLowerCase() : null;
  const priced = (e.type === 'INITIAL_PURCHASE' || e.type === 'RENEWAL' || e.type === 'NON_RENEWING_PURCHASE' || e.type === 'PRODUCT_CHANGE') && cur && typeof e.price_in_purchased_currency === 'number';
  return {
    id: e.id, uid: e.app_user_id && !e.app_user_id.startsWith('$RCAnonymousID') ? e.app_user_id : null, type: e.type,
    productId: e.product_id ?? null, amount: priced ? toMinor(e.price_in_purchased_currency as number, cur as string) : null, currency: cur,
    store: e.store ?? null, environment: e.environment ?? null, transactionId: e.transaction_id ?? null,
    at: Math.floor((e.purchased_at_ms ?? e.event_timestamp_ms ?? Date.now()) / 1000),
    expiresAt: e.expiration_at_ms ? Math.floor(e.expiration_at_ms / 1000) : null, periodType: e.period_type ?? null,
  };
}
export async function recordStoreEvent(db: Firestore, e: RcMoneyEvent): Promise<void> {
  try {
    const rec = storeEventFrom(e);
    if (!rec) return;
    await db.collection(FIN.storeEvents).doc(rec.id).set(rec);
    const meta = await getMeta(db);
    await bumpVersion(db, meta.storeLedgerSince ? {} : { storeLedgerSince: rec.at });
  } catch (err) {
    console.error('[finance] store ledger failed', e.id, err);
  }
}

let cache: { version: number; data: FinData; at: number } | null = null;

export async function loadFinData(db: Firestore): Promise<{ data: FinData; meta: FinMeta }> {
  const meta = await getMeta(db);
  if (cache && cache.version === meta.version && Date.now() - cache.at < 10 * 60_000) return { data: cache.data, meta };
  const all = async <T>(col: string) => (await db.collection(col).get()).docs.map((d) => d.data() as T);
  const [customers, subscriptions, invoices, charges, refunds, disputes, subChanges, storeEvents] = await Promise.all([
    all<FinData['customers'][number]>(FIN.customers), all<FinData['subscriptions'][number]>(FIN.subscriptions),
    all<FinData['invoices'][number]>(FIN.invoices), all<FinData['charges'][number]>(FIN.charges),
    all<FinData['refunds'][number]>(FIN.refunds), all<FinData['disputes'][number]>(FIN.disputes),
    all<FinData['subChanges'][number]>(FIN.subChanges), all<FinData['storeEvents'][number]>(FIN.storeEvents),
  ]);
  const data: FinData = { customers, subscriptions, invoices, charges, refunds, disputes, subChanges, storeEvents };
  cache = { version: meta.version, data, at: Date.now() };
  return { data, meta };
}

/** Admin action trail for anything sensitive (sync, refund, export). */
export async function audit(db: Firestore, entry: { uid: string; action: string; detail: Record<string, unknown> }): Promise<void> {
  // Never lets an audit failure break the action it records.
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await db.collection(FIN.audit).doc(id).set({ ...entry, at: FieldValue.serverTimestamp() });
  } catch (e) { console.error('[finance] audit write failed', e); }
}
