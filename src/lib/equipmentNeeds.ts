import { type EquipmentItem, isEquipmentItem } from './equipment';

/**
 * What an exercise needs, and what to do when the member does not have it.
 *
 * Programs store exercises by name, so needs are read from the name
 * ("Barbell Bench Press" needs a barbell and a bench) with the exercise
 * library's own equipment tags taking precedence when the admin has set
 * them. Swaps come from a fixed table, ordered from closest to furthest
 * from the original movement, and the first one the member can do with
 * what they own wins. Pure. Tested without a browser.
 */

type Rule = { test: RegExp; needs: EquipmentItem[] };

// Order matters: the first matching rule that names a specific implement
// wins over a generic one, so "Dumbbell Bench Press" is dumbbells + bench,
// not barbell + bench.
const NAME_RULES: Rule[] = [
  { test: /\bdumbbell|\bdb\b/i, needs: ['dumbbells'] },
  { test: /\bkettlebell|\bkb\b|swing/i, needs: ['kettlebells'] },
  { test: /\bband/i, needs: ['bands'] },
  { test: /\bcable|pulldown|pushdown|face pull|pec deck|fly machine/i, needs: ['cable'] },
  { test: /\bmachine|leg press|leg curl|leg extension|hack squat|smith|hip abduct|hip adduct|calf raise machine|chest press machine|lat machine/i, needs: ['machines'] },
  { test: /pull[- ]?up|chin[- ]?up|hanging|toes to bar|muscle[- ]up|dead hang/i, needs: ['pull-up-bar'] },
  { test: /\bbarbell|\bbb\b|back squat|front squat|deadlift|clean|snatch|overhead press|military press|bench press|hip thrust|good morning|rack pull|pendlay|zercher|landmine/i, needs: ['barbell'] },
];
// Second pass: implements implied by the movement, added on top.
const EXTRA_RULES: Rule[] = [
  { test: /bench press|incline press|decline press|\bfly\b|flye|skull ?crusher|hip thrust|bench dip|step[- ]?up|box jump|bulgarian|split squat.*bench/i, needs: ['bench'] },
];
// Names that are bodyweight even though a word above might match.
const BODYWEIGHT = /push[- ]?up|press[- ]?up|burpee|plank|sit[- ]?up|crunch|mountain climber|jumping jack|\brun\b|running|sprint|jog|ruck|march|walk|swim|row(ing)? (erg|machine)|bike|cycle|jump rope|skipping|air squat|bodyweight|pistol|lunge(?!.*(dumbbell|barbell|kettlebell))|glute bridge|superman|bird dog|dead bug|hollow|leg raise(?!.*hanging)|wall sit|nordic|inverted row|dip(?!.*bench)|handstand|pike|bear crawl|stretch|mobility|foam roll/i;

/** Equipment an exercise needs, from its name alone. [] = bodyweight. */
export function inferNeeds(name: string): EquipmentItem[] {
  const n = name.toLowerCase();
  const out = new Set<EquipmentItem>();
  // A dumbbell/kettlebell/band/cable word beats the bodyweight guard, so
  // "Dumbbell Lunge" still needs dumbbells; only a name with none of those
  // and a bodyweight word is bodyweight.
  const specific = NAME_RULES.find((r) => r.test.test(n));
  if (!specific) {
    if (BODYWEIGHT.test(n)) return [];
  }
  if (specific) {
    // Barbell is the generic fallback for squat/press/row words; a name
    // that also says dumbbell or kettlebell means that implement instead,
    // which the rule order already gives us. A bodyweight word beside a
    // generic barbell hit ("Bodyweight Squat") wins for the barbell rule only.
    if (specific.needs[0] === 'barbell' && BODYWEIGHT.test(n)) return [];
    specific.needs.forEach((x) => out.add(x));
  }
  for (const r of EXTRA_RULES) if (r.test.test(n)) r.needs.forEach((x) => out.add(x));
  // Only a barbell squat needs a rack; goblet, split and air squats do not.
  if (out.has('barbell') && /squat/.test(n)) out.add('squat-rack');
  return Array.from(out);
}

/** The exercise library's equipment strings (admin-picked) → items. */
export function libraryNeeds(tags: readonly string[] | undefined): EquipmentItem[] | null {
  if (!tags || tags.length === 0) return null;
  const map: Record<string, EquipmentItem | null> = {
    bodyweight: null, barbell: 'barbell', dumbbell: 'dumbbells', dumbbells: 'dumbbells', cable: 'cable', machine: 'machines', machines: 'machines',
    kettlebell: 'kettlebells', kettlebells: 'kettlebells', 'resistance band': 'bands', band: 'bands', bands: 'bands', 'pull-up bar': 'pull-up-bar', 'pullup bar': 'pull-up-bar',
    bench: 'bench', rack: 'squat-rack', 'squat rack': 'squat-rack',
  };
  const out = new Set<EquipmentItem>();
  let known = false;
  for (const t of tags) {
    const k = t.trim().toLowerCase();
    if (k === 'mixed') continue;
    if (k in map) { known = true; const v = map[k]; if (v) out.add(v); }
    else if (isEquipmentItem(k)) { known = true; if (k !== 'bodyweight') out.add(k); }
  }
  return known ? Array.from(out) : null;
}

/** Library tags when the admin set them, the name otherwise. */
export function needsFor(name: string, libraryTags?: readonly string[]): EquipmentItem[] {
  return libraryNeeds(libraryTags) ?? inferNeeds(name);
}

/** What the member lacks. An empty `owned` means "unknown" and never warns. */
export function missingFor(needs: readonly EquipmentItem[], owned: readonly EquipmentItem[]): EquipmentItem[] {
  if (owned.length === 0) return [];
  return needs.filter((n) => !owned.includes(n));
}

/** Union of needs across a day, in first-seen order. */
export function dayNeeds(exercises: readonly { name: string; libraryTags?: readonly string[] }[]): EquipmentItem[] {
  const out: EquipmentItem[] = [];
  for (const e of exercises) for (const n of needsFor(e.name, e.libraryTags)) if (!out.includes(n)) out.push(n);
  return out;
}
