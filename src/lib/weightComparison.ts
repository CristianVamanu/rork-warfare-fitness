/**
 * "You lifted the weight of a grizzly bear" — turning a kg total into
 * something a stranger can feel in half a second.
 *
 * Deliberately NOT randomized away from the real number. An earlier version
 * of this plan mentioned rotating the object so the card "doesn't get
 * stale" at every-workout frequency — on reflection that trades away the
 * one thing that makes the number worth sharing: it's true. Two sessions
 * with genuinely similar volume SHOULD show a similar object; the variety
 * comes from the numbers actually varying workout to workout, not from
 * injecting noise that decouples the picture from the total. The only
 * randomization here is a tie-break between objects of near-identical
 * reference weight, so two truly interchangeable choices don't always
 * resolve the same way.
 *
 * All reference weights are approximate real-world averages — not
 * precise, not claimed to be. Good enough for "roughly this heavy",
 * which is the entire job of the comparison.
 */

export interface ComparisonObject {
  id: string;
  emoji: string;
  label: string;      // singular, capitalized for display — "Grizzly Bear"
  labelLower: string; // for a sentence — "grizzly bear"
  weightKg: number;
}

/**
 * Where a real cut-out image for an object lives, if one has been added.
 *
 * Convention over configuration: drop `<id>.png` into
 * public/images/comparisons/ and the card uses it automatically — no code
 * change, no list to keep in sync. The card falls back to the emoji when
 * the file isn't there (or fails to load), so a partial set is fine and
 * objects can be upgraded from emoji to artwork one at a time.
 *
 * PNG with a transparent background, roughly 800x600, under ~150KB.
 */
export function comparisonImageUrl(id: string): string {
  return `/images/comparisons/${id}.png`;
}

// Ascending by weight. Emoji rather than illustration/photo assets — see
// this feature's design conversation: no licensing question, zero image
// weight added to the app (a glyph, not a file), renders correctly when
// html-to-image rasterizes the card because it captures the browser's own
// emoji font paint, not a live font dependency at share time.
export const COMPARISON_OBJECTS: ComparisonObject[] = [
  { id: 'labrador', emoji: '🐕', label: 'Labrador', labelLower: 'Labrador', weightKg: 30 },
  { id: 'lion', emoji: '🦁', label: 'Lion', labelLower: 'lion', weightKg: 190 },
  { id: 'piano', emoji: '🎹', label: 'Upright Piano', labelLower: 'upright piano', weightKg: 200 },
  { id: 'motorbike', emoji: '🏍️', label: 'Motorbike', labelLower: 'motorbike', weightKg: 220 },
  { id: 'grizzly', emoji: '🐻', label: 'Grizzly Bear', labelLower: 'grizzly bear', weightKg: 360 },
  { id: 'grand-piano', emoji: '🎼', label: 'Grand Piano', labelLower: 'grand piano', weightKg: 480 },
  { id: 'giraffe', emoji: '🦒', label: 'Giraffe', labelLower: 'giraffe', weightKg: 800 },
  { id: 'small-car', emoji: '🚗', label: 'Small Car', labelLower: 'small car', weightKg: 1200 },
  { id: 'sports-car', emoji: '🏎️', label: 'Sports Car', labelLower: 'sports car', weightKg: 1500 },
  { id: 'rhino', emoji: '🦏', label: 'Rhino', labelLower: 'rhino', weightKg: 2300 },
  { id: 'monster-truck', emoji: '🛻', label: 'Monster Truck', labelLower: 'monster truck', weightKg: 4500 },
  { id: 'elephant', emoji: '🐘', label: 'Elephant', labelLower: 'elephant', weightKg: 6000 },
  { id: 't-rex', emoji: '🦖', label: 'T-Rex', labelLower: 'T-Rex', weightKg: 8000 },
  { id: 'school-bus', emoji: '🚌', label: 'School Bus', labelLower: 'school bus', weightKg: 12000 },
  { id: 'helicopter', emoji: '🚁', label: 'Helicopter', labelLower: 'helicopter', weightKg: 15000 },
  { id: 'blue-whale', emoji: '🐋', label: 'Blue Whale', labelLower: 'blue whale', weightKg: 150000 },
];

/** Below this, no comparison is honest — a bodyweight-only session (push-ups,
 * pull-ups logged at 0kg) totals near zero and "0.1 Labradors" reads as
 * broken, not motivating. The card simply omits the line below this. */
const MIN_COMPARABLE_KG = 15;

export interface WeightComparison {
  object: ComparisonObject;
  /** Whole units — always ≥ 1. "1 grizzly bear", never "0.4". */
  count: number;
}

/**
 * The largest object this total clears, favouring "close to 1×" over
 * technically-eligible-but-tiny counts of something huge (100kg reads
 * better as "half a grizzly bear's worth" than as "0.007 blue whales").
 * A tie between two objects whose weight rounds to the same count is
 * broken pseudo-randomly (seeded, so it's stable for a given total rather
 * than flickering on re-render) — see the file header for why this is the
 * ONLY randomization here.
 */
export function pickWeightComparison(totalKg: number, seed = totalKg): WeightComparison | null {
  if (!Number.isFinite(totalKg) || totalKg < MIN_COMPARABLE_KG) return null;

  // Sorted here rather than trusted from the table's own order — the table
  // is documented as ascending but is not a hard invariant anything enforces
  // (two objects landed out of order by weight during writing it, caught
  // only by this function's own test). Sorting explicitly means a future
  // edit to COMPARISON_OBJECTS can never silently break "largest wins".
  const eligible = [...COMPARISON_OBJECTS]
    .filter((o) => totalKg >= o.weightKg)
    .sort((a, b) => b.weightKg - a.weightKg);
  if (eligible.length === 0) return null;

  const best = eligible[0];

  // Tie-break candidates: only objects genuinely close in weight to the
  // top pick (within 15%) — e.g. lion (190) and piano (200) are near-
  // interchangeable, so which one shows for a 195kg total is a fair coin
  // flip either way. This must NOT be "any object that also lands on
  // count 1" — giraffe (800) and small-car (1200) both do that for a
  // 1300kg total despite being nothing alike in weight, which is the bug
  // an earlier version of this function had: it would pick giraffe over
  // the correctly-largest small-car roughly half the time.
  const tied = eligible.filter((o) => o.weightKg >= best.weightKg * 0.85);
  const chosen = tied.length === 1 ? best : tied[Math.floor(seededFraction(seed) * tied.length)];
  const count = Math.max(1, Math.floor(totalKg / chosen.weightKg));
  return { object: chosen, count };
}

/** Deterministic 0..1 from a number seed — no Math.random, so the same
 * total always resolves to the same tie-break within one render. */
function seededFraction(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** "the weight of a grizzly bear" / "the weight of 3 grizzly bears". */
export function comparisonPhrase(c: WeightComparison): string {
  if (c.count === 1) {
    const article = /^[aeiou]/i.test(c.object.labelLower) ? 'an' : 'a';
    return `the weight of ${article} ${c.object.labelLower}`;
  }
  return `the weight of ${c.count} ${pluralize(c.object.labelLower)}`;
}

/** English pluralization is not just "+s" — "school bus" -> "school buses",
 * not "school buss". Covers every ending actually present in
 * COMPARISON_OBJECTS rather than attempting a general-purpose rule. */
function pluralize(label: string): string {
  return /[sxz]$|[cs]h$/.test(label) ? `${label}es` : `${label}s`;
}
