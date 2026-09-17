import { formatMoney, cadenceLabel } from './trialReminder';

/**
 * Abandoned-checkout recovery: the one email sent to someone who opened
 * checkout for a membership plan and did not finish.
 *
 * Pure: decides WHETHER and WHAT, never sends. plan-checkout writes the
 * intent when it creates the Stripe session; the hourly notifications job
 * reads it back through `checkoutRecoveryDue` and sends at most once.
 *
 * Two emails, no discount. A cheap trial that gets cheaper when you walk
 * away teaches people to walk away. The first goes a few hours after they
 * left; the second two days later; then silence.
 */

/** Written to users/{uid}.checkoutIntent by plan-checkout. */
export interface CheckoutIntent {
  planId: string;
  planName: string;
  months: number;
  /** "$49 a month", "$490 a year". */
  amountLabel: string;
  /** "7 days for $1", or null when there is no trial on offer. */
  trialLabel: string | null;
  /** Firestore Timestamp on the wire; anything with toMillis(), or a Date. */
  startedAt: unknown;
}

/** Wait this long after the last checkout start before writing. Someone
 *  still on the page, or who paid and is waiting on the webhook, must not
 *  get a "you forgot" email. */
export const RECOVERY_DELAY_MS = 3 * 60 * 60 * 1000;
/** The follow-up, measured from the same checkout start. */
export const RECOVERY_FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000;
/** Older than this and the moment has passed; stay quiet. */
export const RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Which email is owed right now, if any. */
export type RecoveryStep = 'first' | 'followup';

export function describeCheckoutOffer(opts: {
  planName: string;
  /** Major units, as stored on the plan (49, 490). */
  totalPrice: number;
  currency: string;
  months: number;
  trialDays: number;
  trialPriceCents: number | null;
}): Pick<CheckoutIntent, 'amountLabel' | 'trialLabel'> {
  const money = formatMoney(Math.round(opts.totalPrice * 100), opts.currency);
  const cadence = opts.months === 12
    ? cadenceLabel('year', 1)
    : cadenceLabel('month', opts.months);
  const amountLabel = cadence ? `${money} ${cadence}` : money;
  const trialLabel = opts.trialDays > 0 && opts.trialPriceCents !== null
    ? `${opts.trialDays} days for ${formatMoney(opts.trialPriceCents, opts.currency)}`
    : null;
  return { amountLabel, trialLabel };
}

function toMillis(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/**
 * Which recovery email, if any, this user should get right now.
 *
 * Every reason to stay quiet is listed rather than folded into one
 * expression, because each is a real person who would otherwise be
 * annoyed: they paid, they are still deciding, they already heard from us,
 * or it was too long ago to matter.
 *
 * Both steps are measured from the same checkout start, and each is sent
 * at most once per start. A later start (new startedAt) is a new decision
 * and begins the sequence again. If the first email was somehow never sent
 * and the follow-up window has arrived, the follow-up alone goes out —
 * two emails minutes apart would be worse than one.
 */
export function checkoutRecoveryStep(
  user: {
    email?: string | null;
    checkoutIntent?: Partial<CheckoutIntent> | null;
    checkoutRecoveryEmailSentAt?: unknown;
    checkoutRecoveryFollowupSentAt?: unknown;
    membership?: { status?: string } | null;
    coaching?: { status?: string } | null;
    role?: string;
    banned?: boolean;
  },
  now: number = Date.now(),
): RecoveryStep | null {
  if (!user.email) return null;
  if (user.banned) return null;
  if (user.role === 'admin' || user.role === 'trainer') return null;
  if (user.membership?.status === 'active' || user.coaching?.status === 'active') return null;
  const intent = user.checkoutIntent;
  if (!intent?.planId || !intent.planName) return null;
  const started = toMillis(intent.startedAt);
  if (started === null) return null;
  const age = now - started;
  if (age < RECOVERY_DELAY_MS) return null;
  if (age > RECOVERY_MAX_AGE_MS) return null;
  const firstAt = toMillis(user.checkoutRecoveryEmailSentAt);
  const followupAt = toMillis(user.checkoutRecoveryFollowupSentAt);
  const firstSent = firstAt !== null && firstAt >= started;
  const followupSent = followupAt !== null && followupAt >= started;
  if (age >= RECOVERY_FOLLOWUP_DELAY_MS) return followupSent ? null : 'followup';
  return firstSent ? null : 'first';
}

/** Kept for callers that only need a yes/no. */
export function checkoutRecoveryDue(user: Parameters<typeof checkoutRecoveryStep>[0], now: number = Date.now()): boolean {
  return checkoutRecoveryStep(user, now) !== null;
}

export function checkoutRecoverySubject(planName: string, step: RecoveryStep = 'first'): string {
  return step === 'followup'
    ? `Still thinking about ${planName}?`
    : `Your ${planName} plan is still waiting`;
}
