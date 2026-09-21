import type { AgeBracket, FitnessGoal, Program } from '@/types';
import { ONBOARDING_GOALS, PROGRAM_LEVELS, PROGRAM_GOALS, EQUIPMENT_OPTIONS, AGE_BRACKETS, type EquipmentTier } from '@/lib/onboardingGoals';

/**
 * The five fields that decide who a program is offered to, as one unit.
 *
 * These are the only inputs the onboarding matcher reads off a program
 * (plus targetGender). They were previously editable only inside the full
 * program builder — a long page led by an AI prompt and an image upload —
 * and the admin reasonably concluded there was "no toggle" for them. The
 * list page now edits them directly through this shape.
 *
 * `normalizeMatching` is the one place the payload is made safe: unknown
 * values are dropped rather than written (a typo in a value would silently
 * route nobody), duplicates collapse, and empty lists are written as EMPTY
 * ARRAYS, not omitted. That last point is the fix for a real bug: the
 * builder used to write `undefined` for an empty list, updateProgram strips
 * undefined before writing, and so unticking every chip and saving left the
 * old list in place. The matcher already treats [] as "not set"
 * (`?.length`), so [] is both clearable and harmless.
 */
export interface ProgramMatching {
  level: Program['level'];
  goal: Program['goal'];
  suitableEquipment: EquipmentTier[];
  recommendedForGoals: FitnessGoal[];
  ageBrackets: AgeBracket[];
  priorityPick: boolean;
}

const LEVELS = new Set(PROGRAM_LEVELS.map((x) => x.v));
const GOALS = new Set(PROGRAM_GOALS.map((x) => x.v));
const EQUIPMENT = new Set<string>(EQUIPMENT_OPTIONS.map((x) => x.v));
const ONBOARDING = new Set<string>(ONBOARDING_GOALS.map((x) => x.v));
const AGES = new Set<string>(AGE_BRACKETS.map((x) => x.v));

/** Keep only known values, in canonical order, once each. */
function pick<T extends string>(raw: unknown, allowed: Set<string>, order: { v: T }[]): T[] {
  const wanted = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && allowed.has(x)) : []);
  return order.map((o) => o.v).filter((v) => wanted.has(v));
}

/** Read a program's current matching fields, tolerating anything missing. */
export function readMatching(p: Partial<Program>): ProgramMatching {
  return normalizeMatching({
    level: p.level,
    goal: p.goal,
    suitableEquipment: p.suitableEquipment,
    recommendedForGoals: p.recommendedForGoals,
    ageBrackets: p.ageBrackets,
    priorityPick: p.priorityPick,
  });
}

export function normalizeMatching(input: {
  level?: unknown;
  goal?: unknown;
  suitableEquipment?: unknown;
  recommendedForGoals?: unknown;
  ageBrackets?: unknown;
  priorityPick?: unknown;
}): ProgramMatching {
  const level = typeof input.level === 'string' && LEVELS.has(input.level as Program['level'])
    ? (input.level as Program['level'])
    : 'intermediate';
  const goal = typeof input.goal === 'string' && GOALS.has(input.goal as Program['goal'])
    ? (input.goal as Program['goal'])
    : 'general';
  return {
    level,
    goal,
    suitableEquipment: pick<EquipmentTier>(input.suitableEquipment, EQUIPMENT, EQUIPMENT_OPTIONS),
    recommendedForGoals: pick<FitnessGoal>(input.recommendedForGoals, ONBOARDING, ONBOARDING_GOALS),
    ageBrackets: pick<AgeBracket>(input.ageBrackets, AGES, AGE_BRACKETS),
    priorityPick: input.priorityPick === true,
  };
}

/** True when nothing would change — lets the Save button stay quiet. */
export function matchingEqual(a: ProgramMatching, b: ProgramMatching): boolean {
  return a.level === b.level
    && a.goal === b.goal
    && a.priorityPick === b.priorityPick
    && a.suitableEquipment.join() === b.suitableEquipment.join()
    && a.recommendedForGoals.join() === b.recommendedForGoals.join()
    && a.ageBrackets.join() === b.ageBrackets.join();
}

/**
 * One line saying who this program will reach, for the collapsed row.
 *
 * Written so the untagged state is the loud one: "Not set — app guesses
 * from exercise names" is precisely the condition that mis-routed five of
 * twelve programs, and an admin scanning the list should see it at once.
 */
export function describeMatching(m: ProgramMatching): string {
  const equip = m.suitableEquipment.length
    ? m.suitableEquipment.map((v) => EQUIPMENT_OPTIONS.find((o) => o.v === v)?.label ?? v).join(' · ')
    : 'Equipment not set — app guesses from exercise names';
  const rec = m.recommendedForGoals.length
    ? `Recommended for ${m.recommendedForGoals.map((v) => ONBOARDING_GOALS.find((o) => o.v === v)?.label ?? v).join(', ')}`
    : 'No goal recommendation — matched by category only';
  const ages = m.ageBrackets.length
    ? ` Ages ${m.ageBrackets.map((v) => AGE_BRACKETS.find((o) => o.v === v)?.label ?? v).join(', ')} only.`
    : '';
  return `${equip}. ${rec}.${ages}`;
}
