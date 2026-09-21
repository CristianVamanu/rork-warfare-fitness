import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS, pickBestProgram } from '@/lib/programs';
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
  const program = pickBestProgram(
    await programPool(),
    goal, experience, trainingDays, sex, equipment, estimatedWeeksToGoal, safeAge,
  );
  if (!program) return null;

  return {
    id: program.id,
    name: program.name,
    description: program.description,
    weeks: program.weeks,
    daysPerWeek: program.daysPerWeek,
    // The same sales copy the public /programs pages use — hook, stats, who
    // it is for — so a reveal can lead with a line and three numbers instead
    // of the entire coaching description. Third argument is the member's own
    // days per week, so the commitment line is honest for someone training
    // fewer days than the program itself lists.
    marketing: buildProgramMarketing(program, undefined, trainingDays),
  };
}
