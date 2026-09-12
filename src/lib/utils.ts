import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Firestore rejects any field whose value is `undefined`, even nested deep
 * inside arrays/objects — strip those out recursively before a write rather
 * than trusting every call site to remember. */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatWeight(value: number, unit: 'kg' | 'lbs'): string {
  return `${value}${unit}`;
}

/** Returns the live discount percent (0 if none/expired) for a config that
 * carries `discountPercent` + `discountExpiresAt` — the same rule the
 * Stripe checkout routes already apply server-side, so the UI can show the
 * exact same "is it active right now" state instead of just trusting
 * whatever percent is stored regardless of expiry. */
export function getActiveDiscountPercent(cfg: { discountPercent?: number; discountExpiresAt?: string } | null | undefined): number {
  if (!cfg?.discountPercent || cfg.discountPercent <= 0 || !cfg.discountExpiresAt) return 0;
  return new Date(cfg.discountExpiresAt).getTime() > Date.now() ? cfg.discountPercent : 0;
}

export function applyDiscount(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

const PERIOD_LABELS: Record<number, string> = { 1: 'Monthly', 3: 'Every 3 months', 6: 'Every 6 months', 12: 'Yearly' };

type PlanPrices = { priceMonthly?: number; price3mo?: number; price6mo?: number; price12mo?: number };

/** Every billing term a plan actually offers — EACH of the four is
 * independently optional. A plan that only has price12mo set offers ONLY a
 * yearly term; it does NOT fall back to showing a monthly price just
 * because priceMonthly happens to be unset. Total price is what's charged
 * per that whole term, not per month, so a 6-month term shows one number,
 * not "x/month". */
export function getPlanBillingPeriods(plan: PlanPrices): { months: 1 | 3 | 6 | 12; price: number; label: string }[] {
  const periods: { months: 1 | 3 | 6 | 12; price: number; label: string }[] = [];
  if (plan.priceMonthly && plan.priceMonthly > 0) periods.push({ months: 1, price: plan.priceMonthly, label: PERIOD_LABELS[1] });
  if (plan.price3mo && plan.price3mo > 0) periods.push({ months: 3, price: plan.price3mo, label: PERIOD_LABELS[3] });
  if (plan.price6mo && plan.price6mo > 0) periods.push({ months: 6, price: plan.price6mo, label: PERIOD_LABELS[6] });
  if (plan.price12mo && plan.price12mo > 0) periods.push({ months: 12, price: plan.price12mo, label: PERIOD_LABELS[12] });
  return periods;
}

/** Whether a plan has ANY purchasable term at all — replaces the old
 * `priceMonthly > 0` check, which wrongly excluded a plan that only offers
 * (say) a yearly price with nothing set for priceMonthly. */
export function planHasAnyPrice(plan: PlanPrices): boolean {
  return getPlanBillingPeriods(plan).length > 0;
}

/** The cheapest way in, across every plan and every term on offer.
 *
 * Compared per MONTH so terms are ranked fairly ($99 for 6 months beats
 * $19/mo), but rendered as the amount actually charged — quoting "$16.50/mo"
 * for a plan that takes $99 in one go is the kind of maths a customer only
 * does after the charge lands. */
export function getCheapestEntryPrice(plans: PlanPrices[]): { months: 1 | 3 | 6 | 12; price: number } | null {
  const all = plans.flatMap((p) => getPlanBillingPeriods(p));
  if (all.length === 0) return null;
  return all.reduce((best, cur) => (cur.price / cur.months < best.price / best.months ? cur : best));
}

/** "$49.00/mo" or "$99.00 every 6 months" — never a per-month figure for a
 * term that isn't billed monthly. */
export function formatBillingPeriod(period: { months: number; price: number }): string {
  return `$${period.price.toFixed(2)}${period.months === 1 ? '/mo' : ` every ${period.months} months`}`;
}

export interface TrialTerms {
  /** Label for the button that starts checkout. */
  ctaLabel: string;
  /** The renewal terms that MUST sit under that button. Never null. */
  disclosure: string;
}

/**
 * The single source of truth for what a visitor is agreeing to pay.
 *
 * This exists because the landing hero priced its disclosure off the
 * "featured" plan and printed "then $49.00/mo" under a $1 trial button —
 * while the pricing section below it sold a $19 tier. Someone who picked the
 * $19 plan had been shown a number that was never theirs, and someone who
 * balked at $49 left without discovering the cheaper option. Both directions
 * cost money, and the higher one invites a chargeback.
 *
 * MembershipGuard had already hit this exact bug and solved it locally by
 * refusing to name a price at all. That's safe but weak — "from $19.00/mo"
 * is both accurate AND the more persuasive line, so the fix lives here where
 * every surface can share it.
 *
 * `plans` should be the purchasable ones only (active, with a real price).
 * The disclosure degrades to naming the term without an amount rather than
 * disappearing, because a fetch failure must never strip the terms off a
 * button that still says "$1.00".
 */
export function buildTrialTerms(opts: {
  trialDays: number;
  paidTrialEnabled: boolean;
  cardUpFrontTrial: boolean;
  trialPriceCents?: number;
  plans: PlanPrices[];
  /** Fallback CTA when there's no trial at all (admin-editable landing copy). */
  noTrialCtaLabel?: string;
}): TrialTerms {
  const { trialDays, paidTrialEnabled, cardUpFrontTrial, plans, noTrialCtaLabel } = opts;
  const trialPrice = ((opts.trialPriceCents ?? 100) / 100).toFixed(2);
  const cheapest = getCheapestEntryPrice(plans);

  // One plan: name its price outright, it's unambiguous. Several: "from",
  // because the visitor hasn't chosen yet and any single number is a guess
  // about which one they'll pick.
  const after = cheapest === null
    ? null
    : plans.length === 1
      ? formatBillingPeriod(cheapest)
      : `from ${formatBillingPeriod(cheapest)}`;

  if (trialDays <= 0) {
    return {
      ctaLabel: noTrialCtaLabel ?? 'Get Started',
      disclosure: after ? `${after[0].toUpperCase()}${after.slice(1)}. Cancel anytime.` : 'Cancel anytime.',
    };
  }

  if (paidTrialEnabled) {
    return {
      ctaLabel: `Start for $${trialPrice}`,
      disclosure: `$${trialPrice} for ${trialDays} days, then ${after ?? "your plan's regular price"}. Cancel anytime.`,
    };
  }

  if (cardUpFrontTrial) {
    return {
      ctaLabel: `Start ${trialDays}-Day Free Trial`,
      disclosure: `Free for ${trialDays} days, then ${after ?? "your plan's regular price"}. Cancel anytime before then and you pay nothing.`,
    };
  }

  return {
    ctaLabel: `Start ${trialDays}-Day Free Trial`,
    disclosure: `Free for ${trialDays} days. No credit card required.`,
  };
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

/** Height conversions — cm is the canonical stored unit, exactly like kg is
 * for body weight. ft/in is display+entry only. */
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54;
  let ft = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - ft * 12);
  // 11.6" rounds to 12" — carry it rather than rendering 5'12".
  if (inches === 12) { ft += 1; inches = 0; }
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
}

/**
 * Formats a BODY weight for display in the user's own preferred unit.
 *
 * Body weight (profile.currentWeightKg, weightGoal.*, progress-photo
 * weightKg) is always STORED in kg regardless of preference — the weigh-in
 * flows convert on the way in (see recordWeight callers) — so every display
 * of it has to convert on the way out. Lifting weights are different: those
 * are stored in whatever unit the user logged them in and are already
 * rendered with `profile.weightUnit` as a bare label, so they must NOT go
 * through this.
 */
export function formatBodyWeight(kg: number | null | undefined, unit: 'kg' | 'lbs' | undefined): string {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  return unit === 'lbs' ? `${kgToLbs(kg)}lbs` : `${kg}kg`;
}

// Sent alongside daily-usage-limited AI/scan endpoints so the server can key
// the reset boundary off the user's own local date instead of the server's
// UTC date — see resolveLocalDate() in src/lib/usageLimit.ts.
export function localDateHeader(): Record<string, string> {
  return { 'x-local-date': new Date().toLocaleDateString('sv-SE') };
}

// A plain <video> tag can only play a direct file (mp4/webm/etc) — a
// youtube.com/youtu.be URL isn't one, so it fails to load silently with no
// error the admin or user would ever see. Detect those and embed via
// iframe instead so pasting a YouTube link actually works. Shared between
// the onboarding video-greeting player and the admin settings preview so
// both agree on what counts as a YouTube link.
export function getYouTubeEmbedUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1`;
  }
  return null;
}
