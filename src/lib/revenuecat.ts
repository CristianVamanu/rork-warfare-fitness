/**
 * RevenueCat → membership. Pure: what a RevenueCat webhook event means for
 * the member's `membership` record. The route applies it with the same
 * writer and ordering guard Stripe uses (lib/stripeMembership).
 *
 * The app logs in to RevenueCat with the Firebase uid, so `app_user_id`
 * is the user document id. Anonymous ids ($RCAnonymousID:...) are ignored.
 */
export interface RevenueCatEvent {
  type?: string;
  id?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  store?: string;
  environment?: string;
}

export type MembershipChange =
  | { kind: 'ignore'; reason: string }
  | { kind: 'grant'; uid: string; expiresAt: Date | undefined; cancelAtPeriodEnd: boolean; eventCreated: number | undefined; productId: string }
  | { kind: 'revoke'; uid: string; eventCreated: number | undefined; productId: string };

const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);

export function membershipChangeFor(e: RevenueCatEvent, entitlement: string): MembershipChange {
  const uid = e.app_user_id && !e.app_user_id.startsWith('$RCAnonymousID') ? e.app_user_id : null;
  if (!uid) return { kind: 'ignore', reason: 'anonymous or missing user' };
  if (e.type === 'TEST') return { kind: 'ignore', reason: 'test event' };
  if (e.entitlement_ids && e.entitlement_ids.length && !e.entitlement_ids.includes(entitlement)) return { kind: 'ignore', reason: 'other entitlement' };
  const eventCreated = e.event_timestamp_ms ? Math.floor(e.event_timestamp_ms / 1000) : undefined;
  const productId = e.product_id ?? '';
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms) : undefined;
  if (e.type && GRANT.has(e.type)) return { kind: 'grant', uid, expiresAt, cancelAtPeriodEnd: false, eventCreated, productId };
  // Cancelled auto-renew: access runs to the end of the paid period.
  if (e.type === 'CANCELLATION') return { kind: 'grant', uid, expiresAt, cancelAtPeriodEnd: true, eventCreated, productId };
  // Billing retry still running: Google keeps access during the grace period.
  if (e.type === 'BILLING_ISSUE') return { kind: 'ignore', reason: 'billing issue, grace period' };
  if (e.type === 'EXPIRATION') return { kind: 'revoke', uid, eventCreated, productId };
  return { kind: 'ignore', reason: `unhandled ${e.type ?? 'event'}` };
}
