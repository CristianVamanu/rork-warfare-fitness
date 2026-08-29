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
  profile: Pick<UserProfile, 'membership' | 'coaching'> | null | undefined
): number {
  if (!config || !config.enabled) return Infinity;
  // 1:1 coaching is a higher-priced add-on tier, not an alternative to a
  // regular membership — an active coaching subscriber gets at least
  // everything a regular member gets.
  if (profile?.membership?.status === 'active' || profile?.coaching?.status === 'active') return Infinity;
  const trialDays = config.trialDays ?? 0;
  return trialDays > 0 ? trialDays : Infinity;
}
