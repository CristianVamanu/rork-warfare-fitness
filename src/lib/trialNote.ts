import type { MembershipConfig } from '@/types';

/** One honest line about what starting costs, from the live membership settings. */
export function trialNote(m: MembershipConfig | null): string {
  const days = m?.enabled ? (m.trialDays ?? 0) : 0;
  if (m?.paidTrialEnabled) return `$${((m.trialPriceCents ?? 100) / 100).toFixed(2)} for ${days} days, then your plan's price. Cancel anytime.`;
  if (!days) return 'Cancel anytime.';
  if (m?.cardUpFrontTrial) return `${days} days free. Card required, nothing charged until the trial ends.`;
  return `${days} days free. No card needed. Cancel anytime.`;
}
