import type { AgeBracket } from '@/types';

/**
 * Which age bracket a member falls in, for program matching.
 *
 * Onboarding has asked for age since the biometrics step existed, and the
 * catalogue has had a program written for people over fifty — but the two
 * never met: age was stored on the profile and never handed to the
 * matcher, so the over-fifty program could only ever win on goal and level,
 * and a 25-year-old was as likely to receive it as a 60-year-old.
 *
 * Brackets rather than a raw number on the program, so the admin ticks
 * "50+" instead of typing a range, and so the rule is the same kind of
 * thing as equipment: a fact about the member that decides who CAN be
 * offered a program. (Who SHOULD be is "Recommend for these goals".)
 *
 * Under 18 or unknown returns undefined — no bracket, so no filtering.
 * Unknown must never exclude: a program tagged for an age is still
 * reachable by someone who did not say theirs.
 */
export function ageBracketFor(age: number | undefined | null): AgeBracket | undefined {
  if (typeof age !== 'number' || !Number.isFinite(age)) return undefined;
  if (age < 18) return undefined;
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  return '50-plus';
}
