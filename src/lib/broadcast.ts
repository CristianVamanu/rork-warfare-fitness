/**
 * Who a broadcast reaches. Pure, so the cron's page filter and the admin
 * form agree by construction and the rule is testable.
 */

export const BROADCAST_AUDIENCES = ['members', 'free', 'users', 'leads'] as const;
export type BroadcastAudience = typeof BROADCAST_AUDIENCES[number];

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  members: 'Paying members',
  free: 'Free accounts',
  users: 'Every account',
  leads: 'Leads who opted in (standards test, free plan)',
};

export function isBroadcastAudience(v: unknown): v is BroadcastAudience {
  return typeof v === 'string' && (BROADCAST_AUDIENCES as readonly string[]).includes(v);
}

/**
 * Whether one user document is in the audience AND may be emailed.
 * Marketing consent is checked here, once, for every audience: a broadcast
 * never reaches someone who has opted out, whatever the audience says.
 */
export function userInAudience(
  u: { email?: string; role?: string; banned?: boolean; membership?: { status?: string }; emailPrefs?: { marketing?: boolean } },
  audience: Exclude<BroadcastAudience, 'leads'>,
): boolean {
  if (!u.email || u.banned || u.role === 'admin') return false;
  if (u.emailPrefs?.marketing === false) return false;
  const member = u.membership?.status === 'active';
  if (audience === 'members') return member;
  if (audience === 'free') return !member;
  return true;
}
