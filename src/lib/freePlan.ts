import type { Program, ProgramDay } from '@/types';
import { slugify } from '@/lib/slug';

/**
 * The free-plan funnel: a visitor leaves an email, and for N days they get
 * one real session a day from a program the admin chose — then a pitch for
 * the rest of it.
 *
 * Why a drip and not a PDF: a PDF is read once and forgotten; seven emails
 * put the product in someone's inbox seven mornings running, each one a
 * workout they can do today and a quiet reminder that this is one week of
 * twelve. The sessions are the program's own — real content the admin
 * already owns, never generated for the email.
 *
 * Pure: which day is due and which session it maps to are decided from
 * numbers, so the cron cannot double-send and the tests need no database.
 */

export const FREE_PLAN_DAY_OPTIONS = [7, 14, 30] as const;
export type FreePlanDays = typeof FREE_PLAN_DAY_OPTIONS[number];

/** One program on offer: its own page at /free-plan/<id>, its own copy. */
export interface FreePlanOffer {
  id: string;
  name: string;
  /** Blank means "use the copy derived from the program". */
  headline: string;
  subheadline: string;
}

export interface FreePlanConfig {
  enabled: boolean;
  /** The program /free-plan itself shows. Always one of `offers`. */
  programId: string;
  programName: string;
  days: FreePlanDays;
  offers: FreePlanOffer[];
  /** Legacy single-offer copy; kept as the default offer's copy on read. */
  headline: string;
  subheadline: string;
}

export const FREE_PLAN_DEFAULTS: Omit<FreePlanConfig, 'programId' | 'programName' | 'offers'> = {
  enabled: false,
  days: 7,
  headline: '',
  subheadline: '',
};

/**
 * Reads system/config.freePlan with every field made safe.
 *
 * Two shapes are accepted. The first version stored one program with one
 * headline; that is read as a single offer so nothing already switched on
 * goes dark. The current shape stores a list of offers, each program with
 * its own page, and which one the bare /free-plan URL shows.
 */
export function freePlanConfig(cfg: { freePlan?: Omit<Partial<FreePlanConfig>, 'offers'> & { offers?: Partial<FreePlanOffer>[] | unknown } } | null | undefined): FreePlanConfig {
  const f = cfg?.freePlan ?? {};
  const days = (FREE_PLAN_DAY_OPTIONS as readonly number[]).includes(Number(f.days)) ? (Number(f.days) as FreePlanDays) : FREE_PLAN_DEFAULTS.days;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const rawOffers = Array.isArray(f.offers) ? f.offers as Partial<FreePlanOffer>[] : [];
  const seen = new Set<string>();
  const offers: FreePlanOffer[] = [];
  for (const o of rawOffers) {
    const id = text(o?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    offers.push({ id, name: text(o?.name), headline: text(o?.headline), subheadline: text(o?.subheadline) });
  }
  const legacyId = text(f.programId);
  if (offers.length === 0 && legacyId) {
    offers.push({ id: legacyId, name: text(f.programName), headline: text(f.headline), subheadline: text(f.subheadline) });
  }
  const programId = offers.some((o) => o.id === legacyId) ? legacyId : (offers[0]?.id ?? '');
  const def = offers.find((o) => o.id === programId);
  return {
    enabled: f.enabled === true && offers.length > 0,
    programId,
    programName: def?.name ?? '',
    days,
    offers,
    headline: def?.headline ?? '',
    subheadline: def?.subheadline ?? '',
  };
}

/**
 * The offer for a program, or null when it is not on offer.
 *
 * Matched by id or by the program's slug (the same slug /programs uses),
 * so an ad link reads /free-plan/legion-endurance rather than a database
 * id, and the sales page and the free page share one name per program.
 */
export function findOffer(plan: FreePlanConfig, key: string | undefined | null): FreePlanOffer | null {
  if (!plan.enabled) return null;
  const k = key || plan.programId;
  return plan.offers.find((o) => o.id === k || offerSlug(o) === k) ?? null;
}

/** The public path for an offer: /free-plan/<slug of the program name>. */
export function offerSlug(offer: Pick<FreePlanOffer, 'name' | 'id'>): string {
  return offer.name ? slugify(offer.name) : offer.id;
}
export function offerPath(offer: Pick<FreePlanOffer, 'name' | 'id'>): string {
  return `/free-plan/${offerSlug(offer)}`;
}

const DAYS_WORD: Record<FreePlanDays, string> = { 7: 'Seven days', 14: 'Two weeks', 30: 'Thirty days' };
const END_WORD: Record<FreePlanDays, string> = { 7: 'the week', 14: 'the fortnight', 30: 'the month' };

const GOAL_LINE: Record<string, string> = {
  strength: 'real strength work',
  hypertrophy: 'real muscle-building',
  endurance: 'real conditioning',
  'weight-loss': 'real fat-loss training',
  general: 'real training',
};

/**
 * The copy a program's page gets when the admin has not written any.
 *
 * Every page reads as the same offer in the same voice; only the noun
 * changes, and the noun comes from the program's goal — a strength
 * program is not sold as selection prep. The admin's own words, when
 * given, win outright.
 */
export function offerCopy(
  offer: Pick<FreePlanOffer, 'headline' | 'subheadline'>,
  program: { name: string; goal?: string; recommendedForGoals?: string[] },
  days: FreePlanDays,
): { headline: string; subheadline: string } {
  const military = program.recommendedForGoals?.includes('military-prep');
  const noun = military ? 'real selection prep' : (GOAL_LINE[program.goal ?? ''] ?? GOAL_LINE.general);
  return {
    headline: offer.headline || `${DAYS_WORD[days]} of ${noun}. Free.`,
    subheadline: offer.subheadline || `One session in your inbox every morning, taken straight from ${program.name}. No account. Decide at the end of ${END_WORD[days]}.`,
  };
}

/**
 * The session for drip day `n` (1-based).
 *
 * Phase one's week, repeated: a free week is the program's first week, and
 * a free month is that week four times — honest, because that is exactly
 * how the program itself starts, and the pitch at the end is for the phases
 * that change. Rest days are kept in: a plan with no rest days is not the
 * plan.
 */
export function dripDayFor(program: Pick<Program, 'schedule' | 'phases'>, n: number): { day: ProgramDay; weekDay: number } | null {
  const week = program.phases?.[0]?.schedule?.length ? program.phases[0].schedule : program.schedule;
  if (!week || week.length === 0 || !Number.isInteger(n) || n < 1) return null;
  const i = (n - 1) % week.length;
  return { day: week[i], weekDay: i + 1 };
}

/**
 * Which drip day is due now, or null.
 *
 * Day 1 goes at signup. Day k goes once k-1 whole days have passed since
 * then. One per run, in order, never past the plan length — so a cron that
 * was down for three days sends day 2 next, not days 2, 3 and 4 at once.
 */
export function dueDripDay(daysSinceStart: number, sent: Record<string, unknown> | undefined, totalDays: number): number | null {
  if (!Number.isFinite(daysSinceStart) || daysSinceStart < 0) return null;
  for (let k = 1; k <= totalDays; k++) {
    if (sent?.[`d${k}`]) continue;
    return daysSinceStart >= k - 1 ? k : null;
  }
  return null;
}

/** A single line a session can be described by, for a subject. */
export function sessionSubject(programName: string, n: number, total: number, day: ProgramDay): string {
  if (n === 1) return `Day 1 of ${total}: ${programName}, week one, as written`;
  if (n >= total) return `Day ${total} of ${total}: where you stand`;
  if (day.isRest) return `Day ${n} of ${total}: rest day. It still counts.`;
  return `Day ${n} of ${total}: ${day.label || 'training day'}`;
}

/** What the last email pitches, in numbers the reader has just earned. */
export function completionLine(total: number, programWeeks: number): string {
  const weeks = Math.max(1, Math.round(total / 7));
  return `You have done ${weeks === 1 ? 'a week' : `${weeks} weeks`} of a ${programWeeks}-week program. The rest changes every four weeks — that is the part that makes it work.`;
}
