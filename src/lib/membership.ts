import type { MembershipConfig, UserProfile } from '@/types';

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
  profile: Pick<UserProfile, 'membership'> | null | undefined
): number {
  if (!config || !config.enabled) return Infinity;
  if (profile?.membership?.status === 'active') return Infinity;
  const trialDays = config.trialDays ?? 0;
  return trialDays > 0 ? trialDays : Infinity;
}
