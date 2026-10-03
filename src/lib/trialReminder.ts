/**
 * What to tell a member before their paid trial converts — worked out from
 * the Stripe subscription itself, so the email can never disagree with the
 * charge that follows it.
 *
 * The reminder exists to stop one specific thing: a member sees an amount
 * they were not expecting, from a name they do not recognise, and disputes
 * it instead of cancelling. A dispute costs the amount plus a fee plus a
 * mark on the account's dispute rate; a cancellation costs nothing. So the
 * email states the exact amount, the exact date, the plan, and how to stop
 * it — the four facts a dispute form asks for.
 *
 * Pure and dependency-free so it can be unit-tested without Stripe.
 */

/** The subset of a Stripe.Subscription this needs — typed loosely on purpose so tests need no SDK types. */
export interface SubscriptionLike {
  trial_end?: number | null;
  metadata?: Record<string, string | undefined> | null;
  items?: { data?: Array<{ price?: PriceLike | null }> } | null;
}

export interface PriceLike {
  unit_amount?: number | null;
  currency?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
  nickname?: string | null;
}

export interface UpcomingCharge {
  /** "£49", "$1", "€49.50" — or null when the price could not be read. */
  amountLabel: string | null;
  /** "a month", "a year", "every 3 months" — or null. */
  cadence: string | null;
  /** "23 September 2026". */
  chargeDate: string;
  /** Whole days from `now` to the charge, floored at 1. */
  daysLeft: number;
  /** From subscription metadata (set at checkout), else the price nickname, else "membership". */
  planName: string;
}

const LOCALE_FOR_CURRENCY: Record<string, string> = {
  gbp: 'en-GB', usd: 'en-US', eur: 'en-IE', cad: 'en-CA', aud: 'en-AU', nzd: 'en-NZ',
};

/** Minor units + ISO code → a human amount. Drops ".00" so £49 reads as £49, keeps real pence. */
export function formatMoney(minorUnits: number, currency: string): string {
  const code = currency.toUpperCase();
  const locale = LOCALE_FOR_CURRENCY[currency.toLowerCase()] ?? 'en-GB';
  const whole = minorUnits % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** "a month", "a year", "every 3 months", "a week". */
export function cadenceLabel(interval?: string | null, count?: number | null): string | null {
  if (!interval) return null;
  const n = count && count > 1 ? count : 1;
  if (n === 1) return `a ${interval}`;
  return `every ${n} ${interval}s`;
}

export function formatChargeDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function describeUpcomingCharge(sub: SubscriptionLike, now: number = Date.now()): UpcomingCharge {
  const trialEnd = sub.trial_end ?? 0;
  const price = sub.items?.data?.[0]?.price ?? null;
  const hasAmount = typeof price?.unit_amount === 'number' && !!price?.currency;
  return {
    amountLabel: hasAmount ? formatMoney(price!.unit_amount as number, price!.currency as string) : null,
    cadence: cadenceLabel(price?.recurring?.interval, price?.recurring?.interval_count),
    chargeDate: formatChargeDate(trialEnd),
    daysLeft: Math.max(1, Math.ceil((trialEnd * 1000 - now) / 86_400_000)),
    planName: sub.metadata?.planName || price?.nickname || 'membership',
  };
}

/**
 * Subject line: the date and the amount, because that is what the member
 * will search their inbox for on the day the charge appears.
 */
export function trialReminderSubject(c: UpcomingCharge): string {
  const money = c.amountLabel ? ` — then ${c.amountLabel}${c.cadence ? ' ' + c.cadence : ''}` : '';
  return `Your ${c.planName} trial ends ${c.chargeDate}${money}`;
}
