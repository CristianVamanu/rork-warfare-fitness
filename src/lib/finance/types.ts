/**
 * Financial mirror records. Stripe is the source of truth; these are slim,
 * normalised copies kept in admin-only Firestore collections (no client rule
 * matches them, so only firebase-admin can read or write them).
 *
 * Every record is keyed by the provider's own id, so writing it again is an
 * overwrite, never a duplicate. Money is always an integer in the currency's
 * minor unit (pence, cents; whole yen for zero-decimal currencies) together
 * with a lowercase ISO currency code. Times are unix seconds (UTC).
 */

export const FIN = {
  customers: 'finCustomers',
  subscriptions: 'finSubscriptions',
  invoices: 'finInvoices',
  charges: 'finCharges',
  refunds: 'finRefunds',
  disputes: 'finDisputes',
  subChanges: 'finSubChanges',
  storeEvents: 'finStoreEvents',
  meta: 'finMeta',
  audit: 'finAudit',
} as const;

export interface FinCustomer {
  id: string; email: string | null; name: string | null; country: string | null;
  uid: string | null; created: number; deleted?: boolean;
}

export interface FinSubItem {
  priceId: string; productId: string | null; nickname: string | null;
  unitAmount: number; currency: string; interval: 'day' | 'week' | 'month' | 'year'; intervalCount: number; quantity: number;
}

export interface FinDiscount {
  percentOff: number | null; amountOff: number | null; currency: string | null;
  duration: 'forever' | 'once' | 'repeating'; end: number | null;
}

export interface FinSubscription {
  id: string; customer: string; uid: string | null;
  status: string; // active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired | paused
  created: number; startDate: number;
  currentPeriodStart: number | null; currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean; cancelAt: number | null; canceledAt: number | null; endedAt: number | null;
  trialStart: number | null; trialEnd: number | null;
  items: FinSubItem[]; discount: FinDiscount | null;
  planId: string | null; planName: string | null; field: string | null;
  cancelReason: string | null; paused: boolean;
}

export interface FinInvoice {
  id: string; number: string | null; customer: string | null; subscription: string | null;
  status: string; // draft | open | paid | uncollectible | void
  billingReason: string | null; currency: string;
  amountDue: number; amountPaid: number; amountRemaining: number; total: number; tax: number; discountTotal: number;
  attemptCount: number; nextPaymentAttempt: number | null;
  created: number; paidAt: number | null; charge: string | null; priceIds: string[];
}

export interface FinCharge {
  id: string; customer: string | null; invoice: string | null; paymentIntent: string | null;
  amount: number; amountRefunded: number; currency: string;
  status: 'succeeded' | 'failed' | 'pending'; refunded: boolean; disputed: boolean;
  created: number; description: string | null;
  failureCode: string | null; failureMessage: string | null; outcomeReason: string | null;
  pmType: string | null; pmBrand: string | null; pmLast4: string | null; country: string | null;
  receiptNumber: string | null; feeAmount: number | null; feeCurrency: string | null;
  meta: { userId: string | null; programId: string | null; kind: string | null };
}

export interface FinRefund {
  id: string; charge: string | null; amount: number; currency: string;
  status: string; reason: string | null; created: number;
}

export interface FinDispute {
  id: string; charge: string | null; amount: number; currency: string;
  status: string; reason: string | null; created: number;
}

/** A price change seen by the webhook (customer.subscription.updated). The
 *  only record of expansion / contraction: Stripe keeps no price history. */
export interface FinSubChange {
  id: string; subscription: string; customer: string; at: number;
  fromMonthly: number; toMonthly: number; currency: string;
}

/** A Google Play purchase/renewal reported by RevenueCat. Gross store price,
 *  before Google's commission and tax; RevenueCat does not send those. */
export interface FinStoreEvent {
  id: string; uid: string | null; type: string; productId: string | null;
  amount: number | null; currency: string | null; store: string | null; environment: string | null;
  transactionId: string | null; at: number; expiresAt: number | null; periodType: string | null;
}

export interface FinData {
  customers: FinCustomer[]; subscriptions: FinSubscription[]; invoices: FinInvoice[];
  charges: FinCharge[]; refunds: FinRefund[]; disputes: FinDispute[];
  subChanges: FinSubChange[]; storeEvents: FinStoreEvent[];
}

export interface FinMeta {
  version: number; lastSyncAt: number | null; lastFullSyncAt: number | null;
  mirrorSince: number | null; storeLedgerSince: number | null; lastError: string | null;
}
