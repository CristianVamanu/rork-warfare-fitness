import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS, rankPrograms } from '@/lib/programs';
import { buildProgramMarketing, type ProgramMarketing } from '@/lib/programMarketing';
import type { Program } from '@/types';

/**
 * The one place a set of quiz answers turns into a program.
 *
 * Two routes need this: the authenticated one that assigns the program at
 * the end of onboarding, and the public one that SHOWS the match before the
 * visitor has an account. If those two ever disagreed, onboarding would
 * promise one program on the signup screen and hand over a different one a
 * second later — which is worse than showing nothing at all.
 *
 * So neither route matches anything itself. There is already precedent for
 * this going wrong in the other direction: the onboarding page used to carry
 * its own copy of the scoring, it fell behind the real one, and it spent a
 * while handing men the women's program. One matcher, no drift.
 *
 * Note the pool rule, which is the subtle part: admin-created public
 * programs REPLACE the built-in seed library rather than joining it. Once an
 * admin has built their own catalogue, the seeds are not a fallback to be
 * mixed in — they are the thing being replaced.
 */

export interface MatchAnswers {
  goal: string;
  experience: string;
  trainingDays: number;
  sex?: string;
  equipment?: string;
  estimatedWeeksToGoal?: number;
  /** Years. Anything outside 13–100 is treated as not given. */
  age?: number;
}

/** What a caller shows. Deliberately not the whole program — a phased
 *  program is seventy-odd exercises and a reveal card needs none of them. */
export interface MatchedProgram {
  id: string;
  name: string;
  description: string;
  weeks: number;
  daysPerWeek: number;
  marketing: ProgramMarketing;
  /**
   * The next-best fits, best first — up to two. Only on the top match.
   *
   * The reveal shows the match large with these small underneath as "also
   * fits you": one tap swaps the selection, the default path is unchanged.
   * A wrong match becomes a tap instead of a paywall, without turning the
   * highest-drop-off screen in the product into a menu.
   */
  alternatives?: MatchedProgram[];
}

/** How many runners-up to offer. Two: a choice, not a catalogue. */
export const ALTERNATIVE_COUNT = 2;

/** The runners-up from a ranking: after the winner, distinct by id. */
export function pickAlternatives(ranked: Program[], n = ALTERNATIVE_COUNT): Program[] {
  const seen = new Set<string>(ranked[0] ? [ranked[0].id] : []);
  const out: Program[] = [];
  for (const p of ranked.slice(1)) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/** The candidate pool: the admin's own public programs, or the seed library
 *  when they have not created any. */
export async function programPool(): Promise<Program[]> {
  const app = getAdminApp();
  if (!app) return MOCK_PROGRAMS;
  const snap = await getAdminDb(app).collection('programs').where('isPublic', '==', true).get();
  const adminPrograms = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);
  return adminPrograms.length > 0 ? adminPrograms : MOCK_PROGRAMS;
}

/** Null only when there is genuinely nothing to match against. */
export async function matchProgram(answers: MatchAnswers): Promise<MatchedProgram | null> {
  const { goal, experience, trainingDays, sex, equipment, estimatedWeeksToGoal, age } = answers;
  // Sanitised here, once, because the public preview route accepts this
  // from an unauthenticated body. A nonsense age becomes "not given",
  // which excludes nothing.
  const safeAge = typeof age === 'number' && Number.isFinite(age) && age >= 13 && age <= 100 ? age : undefined;
  const ranked = rankPrograms(
    await programPool(),
    goal, experience, trainingDays, sex, equipment, estimatedWeeksToGoal, safeAge,
  );
  const program = ranked[0];
  if (!program) return null;

  // The same sales copy the public /programs pages use — hook, stats, who
  // it is for — so a reveal can lead with a line and three numbers instead
  // of the entire coaching description. Third argument is the member's own
  // days per week, so the commitment line is honest for someone training
  // fewer days than the program itself lists.
  const summarise = (p: Program): MatchedProgram => ({
    id: p.id,
    name: p.name,
    description: p.description,
    weeks: p.weeks,
    daysPerWeek: p.daysPerWeek,
    marketing: buildProgramMarketing(p, undefined, trainingDays),
  });

  return { ...summarise(program), alternatives: pickAlternatives(ranked).map(summarise) };
}
