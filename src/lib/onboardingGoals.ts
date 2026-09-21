import type { FitnessGoal, Program } from '@/types';

/**
 * The words the admin sees when deciding who a program is for.
 *
 * One list, used by both places that edit matching fields — the program
 * builder and the quick "Matching" panel on the programs list. A second
 * copy of any of these is how a control quietly stops meaning what it says:
 * an admin ticks "Selection Prep" in one screen, the other screen has it
 * under a different value, and nothing is routed anywhere.
 *
 * ONBOARDING_GOALS is kept verbatim from src/app/onboarding/page.tsx, in
 * onboarding's order, so ticking a goal here is ticking the same button the
 * member pressed. The values are FitnessGoal, so a rename in the type
 * breaks the build rather than silently un-recommending a program.
 */
export const ONBOARDING_GOALS: { v: FitnessGoal; label: string }[] = [
  { v: 'military-prep', label: 'Selection Prep' },
  { v: 'lose-fat', label: 'Lose Fat' },
  { v: 'build-muscle', label: 'Build Muscle' },
  { v: 'recomposition', label: 'Recomposition' },
  { v: 'strength', label: 'Get Stronger' },
];

export const PROGRAM_LEVELS: { v: Program['level']; label: string }[] = [
  { v: 'beginner', label: 'Beginner' },
  { v: 'intermediate', label: 'Intermediate' },
  { v: 'advanced', label: 'Advanced' },
];

/** The program's own category — the fallback the matcher uses when no
 *  goal is explicitly recommended. Labelled as the list page shows it. */
export const PROGRAM_GOALS: { v: Program['goal']; label: string }[] = [
  { v: 'general', label: 'General Fitness' },
  { v: 'strength', label: 'Strength' },
  { v: 'hypertrophy', label: 'Muscle Building' },
  { v: 'weight-loss', label: 'Weight Loss' },
  { v: 'endurance', label: 'Endurance' },
];

export type EquipmentTier = 'minimal' | 'home' | 'full-gym';

export const EQUIPMENT_OPTIONS: { v: EquipmentTier; label: string }[] = [
  { v: 'minimal', label: 'Minimal' },
  { v: 'home', label: 'Home gym' },
  { v: 'full-gym', label: 'Full gym' },
];
