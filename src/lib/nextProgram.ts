import type { Program, NextProgramPlan } from '@/types';
import { rankPrograms } from './programs';

/**
 * Program chaining: the next phase is decided before the current one ends.
 *
 * A program finishing used to hand the member a library and a decision.
 * On a monthly subscription that gap is where people leave. So from the
 * last fifth of a program the app already knows what follows, says so on
 * the training tab, and the completion moment ends in one button: Start.
 *
 * Everything with a rule in it is here and pure, so it can be asserted.
 * The route (api/programs/next) only fetches, calls these, and writes.
 */

/** How far through a program the next one gets planned. */
export const PLAN_AT_PCT = 80;

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
type Level = (typeof LEVELS)[number];

/** One step harder than `level`, capped at advanced. */
export function stepUp(level: string | undefined): Level {
  const i = LEVELS.indexOf((level ?? 'intermediate') as Level);
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, i) + 1)];
}

const rank = (l: string | undefined) => Math.max(0, LEVELS.indexOf((l ?? 'intermediate') as Level));

/**
 * Should the client ask the server to plan the next program now?
 *
 * Yes once the member is PLAN_AT_PCT through, or finished, and there is no
 * plan yet for THIS program. A plan for an earlier program does not count:
 * it describes a chain the member already left.
 */
export function shouldPlanNext(args: {
  activeProgramId?: string;
  pct: number;
  finished: boolean;
  plan?: NextProgramPlan | null;
}): boolean {
  const { activeProgramId, pct, finished, plan } = args;
  if (!activeProgramId) return false;
  if (!finished && pct < PLAN_AT_PCT) return false;
  return plan?.forProgramId !== activeProgramId;
}

/** The plan, if it was made for the program that is active right now. */
export function currentPlan(plan: NextProgramPlan | null | undefined, activeProgramId: string | undefined): NextProgramPlan | null {
  if (!plan || !activeProgramId) return null;
  return plan.forProgramId === activeProgramId ? plan : null;
}

export interface NextPickInput {
  pool: Program[];
  /** The program being finished. May be a seed, an admin program or a personal build. */
  current: Pick<Program, 'id' | 'level' | 'nextProgramId'> & Partial<Program>;
  /** Ids the member has already completed (programProgress at 100%, celebrated). */
  completedIds: string[];
  goal: string;
  experience: string;
  trainingDays: number;
  sex?: string;
  equipment?: string;
  age?: number;
}

export interface NextPick {
  program: Program;
  reason: NextProgramPlan['reason'];
}

/**
 * Which program comes next.
 *
 * 1. The admin's sequel, if one is set and still exists in the pool.
 * 2. Otherwise the matcher, asked for one level up from the program just
 *    finished (never below the member's own level), with the current
 *    program and anything already completed removed from the pool. The
 *    member's goal, days, sex, kit and age are unchanged: the next phase
 *    is the same fight, harder.
 * 3. If that leaves nothing, allow completed programs back in; if it still
 *    leaves nothing, the current program again. A repeat is a worse next
 *    phase than a new one, but it is a next phase, which an empty screen
 *    is not.
 */
export function pickNextProgram(input: NextPickInput): NextPick | null {
  const { pool, current, completedIds, goal, trainingDays, sex, equipment, age } = input;
  if (pool.length === 0) return null;

  if (current.nextProgramId) {
    const sequel = pool.find((p) => p.id === current.nextProgramId);
    if (sequel && sequel.id !== current.id) return { program: sequel, reason: 'sequence' };
  }

  const targetLevel = LEVELS[Math.max(rank(input.experience), rank(stepUp(current.level)))];
  const done = new Set([current.id, ...completedIds]);
  const fresh = pool.filter((p) => !done.has(p.id));
  // A next phase does not go backwards. The matcher weights a goal match
  // above a level match, so without this a strength intermediate finishing
  // would be sent to the beginner strength program over an intermediate
  // one of another goal. Programs at or above the current level first;
  // only when none exist does the whole fresh pool compete.
  const forward = fresh.filter((p) => rank(p.level) >= rank(current.level));
  const notCurrent = pool.filter((p) => p.id !== current.id);

  for (const candidates of [forward, fresh, notCurrent]) {
    const ranked = rankPrograms(candidates, goal, targetLevel, trainingDays, sex, equipment, undefined, age);
    if (ranked[0]) return { program: ranked[0], reason: 'matched' };
  }

  const again = pool.find((p) => p.id === current.id);
  return again ? { program: again, reason: 'repeat' } : null;
}

/** Programs the member has run to the end, from their saved snapshots. */
export function completedProgramIds(args: {
  programProgress?: Record<string, { completedWorkouts?: number; totalWorkouts?: number }>;
  celebratedPrograms?: string[];
}): string[] {
  const ids = new Set<string>(args.celebratedPrograms ?? []);
  for (const [id, snap] of Object.entries(args.programProgress ?? {})) {
    const total = snap.totalWorkouts ?? 0;
    if (total > 0 && (snap.completedWorkouts ?? 0) >= total) ids.add(id);
  }
  return [...ids];
}

/** The line the training tab shows while the current program is still running. */
export function planLine(plan: NextProgramPlan, totalDays: number): string {
  const how = plan.reason === 'sequence' ? 'Next in the sequence' : plan.reason === 'repeat' ? 'Running it again' : 'Next phase locked in';
  return `${how}: ${plan.programName}, after day ${totalDays}.`;
}
