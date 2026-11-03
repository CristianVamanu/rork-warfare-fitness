/**
 * Alternatives for "Swap exercise" in a workout: lifts that train the same
 * movement, for when the machine is taken, the gym lacks the kit or
 * something hurts. Two sources, merged:
 *  1. A built-in list per movement pattern (always available).
 *  2. The admin's exercise library (Admin → Exercise library), matched on
 *     shared muscle groups, so swaps can come with a demo video.
 * Pure, unit-tested.
 */
import { exerciseKey } from './exerciseName';

export interface SwapOption { name: string; videoUrl?: string; note: string }
interface LibraryEntry { name: string; aliases?: string[]; muscleGroups?: string[]; equipment?: string[]; videoUrl?: string }

// Order matters: more specific patterns first.
const PATTERNS: { label: string; match: RegExp; options: string[] }[] = [
  { label: 'incline press', match: /incline.*(press|bench)/i, options: ['Incline Bench Press', 'Incline Dumbbell Press', 'Incline Machine Press', 'Feet-Elevated Push-Up'] },
  { label: 'chest fly', match: /fly|flye|pec deck|crossover/i, options: ['Dumbbell Fly', 'Cable Fly', 'Pec Deck'] },
  { label: 'triceps', match: /tricep|pushdown|skull|kickback|dip|close.?grip/i, options: ['Triceps Pushdown', 'Overhead Triceps Extension', 'Skull Crusher', 'Close-Grip Bench Press', 'Dips'] },
  { label: 'hamstrings', match: /leg curl|hamstring curl|nordic/i, options: ['Lying Leg Curl', 'Seated Leg Curl', 'Nordic Curl', 'Romanian Deadlift'] },
  { label: 'biceps', match: /curl/i, options: ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Cable Curl', 'Preacher Curl'] },
  { label: 'side delts', match: /lateral raise|side raise|upright row/i, options: ['Lateral Raise', 'Cable Lateral Raise', 'Machine Lateral Raise'] },
  { label: 'calves', match: /calf/i, options: ['Standing Calf Raise', 'Seated Calf Raise', 'Leg Press Calf Raise'] },
  { label: 'quads', match: /leg extension|sissy/i, options: ['Leg Extension', 'Goblet Squat', 'Leg Press'] },
  { label: 'lunge', match: /lunge|split squat|step.?up/i, options: ['Walking Lunge', 'Reverse Lunge', 'Bulgarian Split Squat', 'Step-Up'] },
  { label: 'hinge', match: /deadlift|rdl|hip thrust|good morning|back extension|glute bridge/i, options: ['Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'Trap Bar Deadlift', 'Hip Thrust', 'Back Extension'] },
  { label: 'squat', match: /squat|leg press|hack/i, options: ['Back Squat', 'Goblet Squat', 'Leg Press', 'Hack Squat', 'Smith Machine Squat'] },
  { label: 'vertical pull', match: /pull.?up|chin.?up|pulldown|pull.?down/i, options: ['Lat Pulldown', 'Assisted Pull-Up', 'Pull-Up', 'Chin-Up', 'Single-Arm Cable Pulldown'] },
  { label: 'row', match: /row/i, options: ['Dumbbell Row', 'Seated Cable Row', 'Chest-Supported Row', 'Machine Row', 'Barbell Row', 'Inverted Row'] },
  { label: 'overhead press', match: /overhead|shoulder press|military|arnold|ohp/i, options: ['Dumbbell Shoulder Press', 'Machine Shoulder Press', 'Overhead Press', 'Arnold Press', 'Landmine Press'] },
  { label: 'chest press', match: /bench|chest press|push.?up|floor press/i, options: ['Dumbbell Bench Press', 'Machine Chest Press', 'Bench Press', 'Push-Up', 'Smith Machine Bench Press'] },
  { label: 'core', match: /plank|crunch|sit.?up|dead bug|knee raise|leg raise|rollout|pallof/i, options: ['Plank', 'Dead Bug', 'Hanging Knee Raise', 'Cable Crunch', 'Ab Wheel Rollout'] },
];

export function movementPattern(name: string): string | null {
  return PATTERNS.find((p) => p.match.test(name))?.label ?? null;
}

export function swapOptions(
  current: { name: string; muscleGroup?: string },
  library: LibraryEntry[] = [],
  max = 8,
): SwapOption[] {
  const key = exerciseKey(current.name);
  const byKey = new Map<string, LibraryEntry>();
  for (const e of library) {
    for (const n of [e.name, ...(e.aliases ?? [])]) if (n) byKey.set(exerciseKey(n), e);
  }
  const self = byKey.get(key);
  const muscles = new Set(
    [...(self?.muscleGroups ?? []), ...(current.muscleGroup ? [current.muscleGroup] : [])].map((m) => m.toLowerCase()),
  );

  const out: SwapOption[] = [];
  const seen = new Set([key]);
  const add = (name: string, note: string) => {
    const k = exerciseKey(name);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const lib = byKey.get(k);
    out.push({ name: lib?.name ?? name, videoUrl: lib?.videoUrl || undefined, note });
  };

  const pattern = PATTERNS.find((p) => p.match.test(current.name));
  if (pattern) pattern.options.forEach((o) => add(o, `Same movement (${pattern.label})`));

  if (muscles.size) {
    library
      .map((e) => ({ e, overlap: (e.muscleGroups ?? []).filter((m) => muscles.has(m.toLowerCase())).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .forEach(({ e }) => add(e.name, `Works ${(e.muscleGroups ?? []).slice(0, 2).join(' and ').toLowerCase()}`));
  }
  return out.slice(0, max);
}
