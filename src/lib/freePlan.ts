import type { Program, ProgramDay } from '@/types';

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

export interface FreePlanConfig {
  enabled: boolean;
  programId: string;
  programName: string;
  days: FreePlanDays;
  headline: string;
  subheadline: string;
}

export const FREE_PLAN_DEFAULTS: Omit<FreePlanConfig, 'programId' | 'programName'> = {
  enabled: false,
  days: 7,
  headline: 'Seven days of real selection prep. Free.',
  subheadline: 'One session in your inbox every morning, taken straight from the program. No account. Decide at the end of the week.',
};

/** Reads system/config.freePlan with every field made safe. */
export function freePlanConfig(cfg: { freePlan?: Partial<FreePlanConfig> } | null | undefined): FreePlanConfig {
  const f = cfg?.freePlan ?? {};
  const days = (FREE_PLAN_DAY_OPTIONS as readonly number[]).includes(Number(f.days)) ? (Number(f.days) as FreePlanDays) : FREE_PLAN_DEFAULTS.days;
  const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  return {
    enabled: f.enabled === true && typeof f.programId === 'string' && f.programId.length > 0,
    programId: typeof f.programId === 'string' ? f.programId : '',
    programName: typeof f.programName === 'string' ? f.programName : '',
    days,
    headline: text(f.headline, FREE_PLAN_DEFAULTS.headline),
    subheadline: text(f.subheadline, FREE_PLAN_DEFAULTS.subheadline),
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
  if (day.isRest) return `Day ${n} of ${total}: rest day`;
  return `Day ${n} of ${total}: ${day.label || 'training day'}`;
}

/** What the last email pitches, in numbers the reader has just earned. */
export function completionLine(total: number, programWeeks: number): string {
  const weeks = Math.max(1, Math.round(total / 7));
  return `You have done ${weeks === 1 ? 'a week' : `${weeks} weeks`} of a ${programWeeks}-week program. The rest changes every four weeks — that is the part that makes it work.`;
}
