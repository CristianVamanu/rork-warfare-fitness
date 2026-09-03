import type { MembershipConfig, UserProfile } from '@/types';

/** Just the trial-relevant slice of MembershipConfig. Every field optional
 * so the server-side callers, which read the raw Firestore doc through a
 * loose cast rather than the full typed MembershipConfig, can pass their
 * config object directly without re-shaping it. */
type TrialConfig = { enabled?: boolean; trialDays?: number; paidTrialEnabled?: boolean };

/**
 * Is this account inside the FREE, no-card trial window — the one anchored
 * to account creation rather than to any Stripe subscription?
 *
 * This lives here, in one place, on purpose. It used to be copy-pasted into
 * four separate files (useFeatureAccess, MembershipGuard, profile/page, and
 * verifyFeatureAccess) and when paid trial was added, three of the four were
 * updated and the fourth — verifyFeatureAccess, the only one that is actual
 * server-side ENFORCEMENT rather than UI — was missed, silently handing
 * every non-paying signup free AI-feature access for trialDays. Every caller
 * must use this function rather than re-deriving the window.
 *
 * Returns false when a PAID trial is configured: under paid trial there is
 * no free window at all, access comes only from a real Stripe subscription
 * (which starts in Stripe's own `trialing` status and is already treated as
 * an active membership by the webhook).
 *
 * `createdAt` is deliberately `unknown` — callers pass a client Firestore
 * Timestamp, an admin-SDK Timestamp, an ISO string or a Date depending on
 * which SDK they came from.
 */
export function isInFreeTrial(
  config: TrialConfig | null | undefined,
  createdAt: unknown
): boolean {
  if (!config?.enabled) return false;
  if (config.paidTrialEnabled) return false;
  const trialDays = config.trialDays ?? 0;
  if (!trialDays || !createdAt) return false;
  const created = (createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(createdAt as string | number | Date);
  if (!(created instanceof Date) || isNaN(created.getTime())) return false;
  return Date.now() - created.getTime() < trialDays * 24 * 60 * 60 * 1000;
}

/** When the free trial window ends, or null if there isn't one. */
export function freeTrialEndsAt(
  config: TrialConfig | null | undefined,
  createdAt: unknown
): Date | null {
  if (!config?.enabled || config.paidTrialEnabled) return null;
  const trialDays = config.trialDays ?? 0;
  if (!trialDays || !createdAt) return null;
  const created = (createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(createdAt as string | number | Date);
  if (!(created instanceof Date) || isNaN(created.getTime())) return null;
  return new Date(created.getTime() + trialDays * 24 * 60 * 60 * 1000);
}

/**
 * How many absolute day-slots (0-indexed, across every week of a program) a
 * user can access right now — `Infinity` for an active paying member,
 * otherwise exactly `trialDays` for everyone else, from day one, not just
 * once some calendar window closes. This is a straight content preview: a
 * 7-day trial means the first 7 days of any program are unlocked and
 * everything past that shows a padlock, immediately — it is NOT the same
 * concept as MembershipGuard/PaywallGate's calendar trial window (which
 * grants full access to other features for `trialDays` calendar days).
 * Those two are deliberately independent: this caps program CONTENT by a
 * fixed day-count regardless of how long the account has existed; those
 * gate other FEATURES by elapsed time. A user could be on day 1 of their
 * account and still only see 7 days of a program unlocked, same as on
 * day 100.
 */
export function getProgramDayLimit(
  config: MembershipConfig | null,
  profile: Pick<UserProfile, 'membership' | 'coaching' | 'purchasedProgramIds'> | null | undefined,
  programId?: string
): number {
  if (!config || !config.enabled) return Infinity;
  // 1:1 coaching is a higher-priced add-on tier, not an alternative to a
  // regular membership — an active coaching subscriber gets at least
  // everything a regular member gets.
  if (hasActiveSubscription(profile)) return Infinity;
  // A one-off purchase of THIS specific program buys the whole program,
  // not a preview of it. Without this, someone who paid for a program was
  // still capped at the free trial's day-count and hit a padlock partway
  // through the thing they'd already bought — and firestore.rules enforced
  // the same cap server-side, so their progress writes were rejected too.
  if (programId && profile?.purchasedProgramIds?.includes(programId)) return Infinity;
  const trialDays = config.trialDays ?? 0;
  return trialDays > 0 ? trialDays : Infinity;
}

/**
 * Grace period applied to a membership's `expiresAt` before access is
 * withdrawn. Stripe retries a failed renewal for several days while the
 * subscription sits in `past_due` (which the webhook deliberately treats as
 * still-active), so cutting access the instant the stored period ends would
 * revoke a member Stripe is still trying to bill. Three days covers the
 * retry schedule with room to spare.
 */
export const MEMBERSHIP_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** Coerces the several shapes `expiresAt` arrives in to a Date, or null. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = (value as { toDate?: () => Date })?.toDate?.() ?? new Date(value as string | number | Date);
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

/**
 * Whether a subscription record still grants access.
 *
 * `status` alone used to be the whole check, and `expiresAt` — written by
 * the webhook on every subscription event — was never read by anything.
 * That made Firestore a pure forward projection of webhook deliveries with
 * no correction loop: lose one `customer.subscription.deleted` permanently
 * (Stripe gives up after ~3 days of failures, or the endpoint was
 * misconfigured for an afternoon) and that account kept full paid access
 * forever, silently. Reading the period end here means a stale 'active'
 * expires on its own instead of lasting indefinitely.
 *
 * A record with no `expiresAt` is treated as active-if-status-says-so, so
 * older documents written before the webhook set the field keep working.
 */
export function subscriptionGrantsAccess(
  record: { status?: string; expiresAt?: unknown } | null | undefined,
): boolean {
  if (record?.status !== 'active') return false;
  const expires = toDate(record.expiresAt);
  if (!expires) return true;
  return expires.getTime() + MEMBERSHIP_GRACE_MS > Date.now();
}

/** True when either a membership or a coaching subscription still grants access. */
export function hasActiveSubscription(
  profile: { membership?: { status?: string; expiresAt?: unknown }; coaching?: { status?: string; expiresAt?: unknown } } | null | undefined,
): boolean {
  return subscriptionGrantsAccess(profile?.membership) || subscriptionGrantsAccess(profile?.coaching);
}
