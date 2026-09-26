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

// ── Swaps ────────────────────────────────────────────────────────────────

interface Alt { name: string; needs: EquipmentItem[] }
/** Closest first. The member gets the first alternative they can do. */
const SWAPS: { test: RegExp; alts: Alt[] }[] = [
  { test: /incline.*(bench|press)/i, alts: [{ name: 'Incline Dumbbell Press', needs: ['dumbbells', 'bench'] }, { name: 'Feet-Elevated Push-Up', needs: [] }] },
  { test: /bench press|chest press/i, alts: [{ name: 'Dumbbell Bench Press', needs: ['dumbbells', 'bench'] }, { name: 'Dumbbell Floor Press', needs: ['dumbbells'] }, { name: 'Push-Up', needs: [] }] },
  { test: /\bfly|flye|pec deck/i, alts: [{ name: 'Dumbbell Fly', needs: ['dumbbells', 'bench'] }, { name: 'Band Chest Fly', needs: ['bands'] }, { name: 'Wide Push-Up', needs: [] }] },
  { test: /overhead press|shoulder press|military press|push press/i, alts: [{ name: 'Dumbbell Shoulder Press', needs: ['dumbbells'] }, { name: 'Kettlebell Press', needs: ['kettlebells'] }, { name: 'Band Shoulder Press', needs: ['bands'] }, { name: 'Pike Push-Up', needs: [] }] },
  { test: /front squat|back squat|hack squat|leg press|smith.*squat/i, alts: [{ name: 'Goblet Squat', needs: ['dumbbells'] }, { name: 'Kettlebell Goblet Squat', needs: ['kettlebells'] }, { name: 'Bulgarian Split Squat', needs: [] }, { name: 'Air Squat', needs: [] }] },
  { test: /romanian deadlift|\brdl\b|stiff.?leg/i, alts: [{ name: 'Dumbbell Romanian Deadlift', needs: ['dumbbells'] }, { name: 'Kettlebell Romanian Deadlift', needs: ['kettlebells'] }, { name: 'Single-Leg Hip Hinge', needs: [] }] },
  { test: /deadlift|rack pull/i, alts: [{ name: 'Kettlebell Deadlift', needs: ['kettlebells'] }, { name: 'Dumbbell Deadlift', needs: ['dumbbells'] }, { name: 'Single-Leg Glute Bridge', needs: [] }] },
  { test: /hip thrust/i, alts: [{ name: 'Dumbbell Hip Thrust', needs: ['dumbbells', 'bench'] }, { name: 'Single-Leg Glute Bridge', needs: [] }] },
  { test: /lat pulldown|pulldown/i, alts: [{ name: 'Pull-Up', needs: ['pull-up-bar'] }, { name: 'Band Lat Pulldown', needs: ['bands'] }, { name: 'Dumbbell Pullover', needs: ['dumbbells'] }] },
  { test: /pull[- ]?up|chin[- ]?up/i, alts: [{ name: 'Band Lat Pulldown', needs: ['bands'] }, { name: 'Dumbbell Row', needs: ['dumbbells'] }, { name: 'Inverted Row', needs: [] }] },
  { test: /barbell row|bent[- ]over row|pendlay|cable row|seated row|machine row|t-bar/i, alts: [{ name: 'Dumbbell Row', needs: ['dumbbells'] }, { name: 'Kettlebell Row', needs: ['kettlebells'] }, { name: 'Band Row', needs: ['bands'] }, { name: 'Inverted Row', needs: [] }] },
  { test: /face pull|rear delt.*(cable|machine)/i, alts: [{ name: 'Band Face Pull', needs: ['bands'] }, { name: 'Dumbbell Rear Delt Raise', needs: ['dumbbells'] }, { name: 'Prone Y-Raise', needs: [] }] },
  { test: /pushdown|skull ?crusher|tricep.*(cable|machine)/i, alts: [{ name: 'Overhead Dumbbell Extension', needs: ['dumbbells'] }, { name: 'Band Pushdown', needs: ['bands'] }, { name: 'Diamond Push-Up', needs: [] }] },
  { test: /barbell curl|cable curl|preacher curl|ez.?bar/i, alts: [{ name: 'Dumbbell Curl', needs: ['dumbbells'] }, { name: 'Band Curl', needs: ['bands'] }, { name: 'Chin-Up', needs: ['pull-up-bar'] }] },
  { test: /lateral raise.*(cable|machine)|cable lateral/i, alts: [{ name: 'Dumbbell Lateral Raise', needs: ['dumbbells'] }, { name: 'Band Lateral Raise', needs: ['bands'] }] },
  { test: /leg curl/i, alts: [{ name: 'Nordic Hamstring Curl', needs: [] }, { name: 'Single-Leg Romanian Deadlift', needs: ['dumbbells'] }, { name: 'Glute Bridge Walkout', needs: [] }] },
  { test: /leg extension/i, alts: [{ name: 'Split Squat', needs: [] }, { name: 'Sissy Squat', needs: [] }] },
  { test: /calf raise/i, alts: [{ name: 'Single-Leg Calf Raise', needs: [] }] },
  { test: /kettlebell swing/i, alts: [{ name: 'Dumbbell Swing', needs: ['dumbbells'] }, { name: 'Broad Jump', needs: [] }] },
  { test: /\bdip/i, alts: [{ name: 'Bench Dip', needs: ['bench'] }, { name: 'Diamond Push-Up', needs: [] }] },
  { test: /lunge|step[- ]?up|split squat/i, alts: [{ name: 'Dumbbell Walking Lunge', needs: ['dumbbells'] }, { name: 'Walking Lunge', needs: [] }] },
  { test: /shrug/i, alts: [{ name: 'Dumbbell Shrug', needs: ['dumbbells'] }, { name: 'Kettlebell Shrug', needs: ['kettlebells'] }] },
  { test: /good morning/i, alts: [{ name: 'Dumbbell Romanian Deadlift', needs: ['dumbbells'] }, { name: 'Single-Leg Hip Hinge', needs: [] }] },
  { test: /clean|snatch/i, alts: [{ name: 'Kettlebell Swing', needs: ['kettlebells'] }, { name: 'Dumbbell Snatch', needs: ['dumbbells'] }, { name: 'Broad Jump', needs: [] }] },
];

/**
 * The closest movement the member can do with what they own, or null when
 * the original already fits, nothing in the table matches, or their
 * equipment is unknown. Never returns the original name.
 */
export function swapFor(name: string, owned: readonly EquipmentItem[], libraryTags?: readonly string[]): Alt | null {
  if (owned.length === 0) return null;
  if (missingFor(needsFor(name, libraryTags), owned).length === 0) return null;
  const rule = SWAPS.find((r) => r.test.test(name));
  if (!rule) return null;
  const can = (a: Alt) => a.needs.every((n) => owned.includes(n)) && a.name.toLowerCase() !== name.trim().toLowerCase();
  return rule.alts.find(can) ?? null;
}

/** What "Where are you today?" resolves to. */
export type KitMode = 'mine' | 'gym' | 'bodyweight';
export const ALL_KIT: EquipmentItem[] = ['dumbbells', 'barbell', 'squat-rack', 'bench', 'cable', 'machines', 'pull-up-bar', 'kettlebells', 'bands'];
export function ownedFor(mode: KitMode, mine: readonly EquipmentItem[]): EquipmentItem[] {
  if (mode === 'gym') return ALL_KIT;
  if (mode === 'bodyweight') return ['bodyweight'];
  return [...mine];
}
