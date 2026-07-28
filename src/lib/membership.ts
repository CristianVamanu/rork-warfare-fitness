import type { MembershipConfig, UserProfile } from '@/types';

// Same trial-window math already used by MembershipGuard and PaywallGate
// (kept independent here rather than importing from either — this is a
// new, narrower gate and shouldn't risk touching the two components that
// already gate the whole app in production).
export function isInTrial(profile: Pick<UserProfile, 'createdAt'> | null | undefined, trialDays: number): boolean {
  if (!trialDays || !profile?.createdAt) return false;
  const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
  const ms = Date.now() - created.getTime();
  return ms < trialDays * 24 * 60 * 60 * 1000;
}

/**
 * How many absolute day-slots (0-indexed, across every week of a program)
 * a user can access right now — `Infinity` for members and anyone still
 * inside their calendar trial window (matching MembershipGuard/PaywallGate:
 * the trial window always grants full access, no exceptions), otherwise
 * exactly `trialDays` once that window has closed without subscribing.
 *
 * This is intentionally a program-CONTENT cap, not a second full-app lock —
 * MembershipGuard's `fullLock` setting already handles "block the whole app
 * once trial ends" for admins who want that. This exists for the (more
 * common) case where `fullLock` is off: without it, a user whose trial
 * ended could otherwise keep progressing through an entire program for
 * free forever. Capped at the first `trialDays` days instead — enough to
 * prove the program's value, not enough to finish it — every user gets a
 * concrete, program-specific reason to subscribe instead of a generic
 * paywall screen.
 */
export function getProgramDayLimit(
  config: MembershipConfig | null,
  profile: Pick<UserProfile, 'createdAt' | 'membership'> | null | undefined
): number {
  if (!config || !config.enabled) return Infinity;
  if (profile?.membership?.status === 'active') return Infinity;
  const trialDays = config.trialDays ?? 0;
  if (!trialDays) return Infinity;
  if (isInTrial(profile, trialDays)) return Infinity;
  return trialDays;
}
