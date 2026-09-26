/**
 * Deciding whether two exercise names are the same movement.
 *
 * The old rule scored shared words over the SHORTER name's word count and
 * accepted anything at 0.5. That arithmetic is what put a band twist behind
 * "Band Pull-Apart": a two-word library name needs exactly one word in common
 * to reach 0.5, and "band" was it. The same rule matched "Dumbbell Hip Thrust"
 * to a dumbbell deadlift and "Mobility Exercises" to a barbell shrug.
 *
 * A wrong clip is worse than no clip. Someone with no video does the exercise
 * as best they understand it; someone shown the wrong video does a different
 * exercise confidently, and the app taught them to. So this errs toward
 * refusing, and the caller shows the plain info button instead.
 *
 * Three rules, in the order they actually decide things:
 *
 *  1. THE MOVEMENT MUST MATCH. The last significant word of a name is the
 *     movement — press, row, squat, thrust, twist. "Hip Thrust" and
 *     "Deadlift" are not the same exercise no matter how much else they
 *     share, and no amount of overlap elsewhere should outvote that.
 *  2. EVERY SPECIFIER MUST APPEAR ON BOTH SIDES. Words like overhead, floor,
 *     band, seated, upright or weighted pin down which variant this is. If one
 *     name carries one and the other does not, they are different exercises
 *     even when the movement word agrees — "Dumbbell Overhead Press" was
 *     showing a decline bench press, and "Barbell Row" is not "Barbell UPRIGHT
 *     Row".
 *  3. ENOUGH OF THE REST IN COMMON, measured over the union of both names
 *     rather than the shorter one, so a short library name can no longer win
 *     on a single shared word.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'for', 'to', 'on', 'of', 'in', 'degree', 'exercises', 'exercise']);

/**
 * Words written as one in one place and two in another. Without this,
 * "Pullups" is a single token that shares nothing with "Pull Up", and the
 * rules call a correct clip a mismatch. Real cases from the catalogue.
 */
const COMPOUNDS: Record<string, string[]> = {
  pullup: ['pull', 'up'],
  pushup: ['push', 'up'],
  chinup: ['chin', 'up'],
  situp: ['sit', 'up'],
  stepup: ['step', 'up'],
  pulldown: ['pull', 'down'],
  pressup: ['press', 'up'],
  signup: ['sign', 'up'],
};

/**
 * Different spellings of one movement. These are not "close enough" — they
 * are the same exercise written by two different people: a calf RAISE and a
 * calf RISE, a dumbbell FLY and a dumbbell FLYE, a press-up and a push-up.
 */
const SYNONYMS: Record<string, string> = {
  rise: 'raise',
  flye: 'fly',
  flie: 'fly',
  jog: 'run',
  sprint: 'run',
  pressup: 'pushup',
};

/** Crude singular form — enough to make "crunches"/"crunch" and "pull-ups"/"pull-up" agree. */
function stem(word: string): string {
  // The guard has to stay at 2, not 3: "ups" is three characters, and leaving
  // it alone made "Pull Ups" and "Pull Up" different exercises. Words like
  // "abs" get mangled to "ab", which is fine — both sides of a comparison are
  // stemmed the same way, so consistency matters here and correct English
  // does not.
  if (word.length <= 2) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('ches')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * "Running" and "run" are the same movement, and thirteen pairings in the
 * catalogue were flagged as mismatches over exactly that. Handles the doubled
 * consonant ("running" → "run") that a naive -ing strip gets wrong ("runn").
 */
function deGerund(word: string): string {
  if (!word.endsWith('ing') || word.length < 6) return word;
  const base = word.slice(0, -3);
  // jogging → joggin → jogg → jog; but "swimming" → "swimm" → "swim"
  if (/([bdfglmnprt])\1$/.test(base)) return base.slice(0, -1);
  return base;
}

export function tokenize(name: string): string[] {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+$/.test(w))
    // Split one-word spellings BEFORE stemming, so "pullups" becomes
    // pull + up rather than a single token that matches nothing.
    .flatMap((w) => COMPOUNDS[stem(w)] ?? [w])
    .map((w) => deGerund(stem(w)))
    .map((w) => SYNONYMS[w] ?? w)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * Words that pin down WHICH variant of a movement this is.
 *
 * Listed in plain form and normalized through tokenize() below, because these
 * are compared against already-normalized tokens: "stretching" arrives as
 * "stretch" and "hanging" as "hang", so listing only the -ing spelling silently
 * matched nothing and let a stretch be offered as a hanging leg raise.
 */
const SPECIFIER_WORDS = [
  // equipment
  'band', 'cable', 'dumbbell', 'barbell', 'barebell', 'kettlebell', 'machine', 'lever', 'smith', 'sled', 'bodyweight',
  // where the load is / body position
  'overhead', 'bench', 'incline', 'decline', 'floor', 'shoulder', 'chest', 'military', 'goblet', 'goodmorning',
  'seated', 'standing', 'lying', 'kneeling', 'hanging', 'stretching', 'supine', 'prone',
  // grip and stance
  'wide', 'close', 'narrow', 'reverse', 'underhand', 'overhand', 'sumo', 'staggered', 'split',
  // which side / how many limbs
  'single', 'one', 'alternate', 'alternating', 'unilateral',
  // named variants that are genuinely different exercises
  'upright', 'bent', 'inverted', 'renegade', 'pendlay', 'preacher', 'concentration', 'hammer', 'skull',
  'romanian', 'stiff', 'sissy', 'bulgarian', 'pistol', 'zercher', 'jefferson', 'arnold', 'diamond',
  'jump', 'jumping', 'plyo', 'explosive', 'isometric', 'eccentric', 'pause', 'tempo',
  // direction
  'front', 'back', 'rear', 'side', 'lateral', 'forward', 'backward',
  // load added or removed — a weighted pull-up is not an assisted one
  'weighted', 'assisted', 'banded',
];
const SPECIFIERS = new Set(SPECIFIER_WORDS.flatMap((w) => tokenize(w)));

/**
 * Words that change WHICH exercise this is must be present in both names or
 * neither.
 *
 * The earlier version listed mutually exclusive groups and only objected when
 * both names named a different member of one — so "Dumbbell Floor Press" and
 * "Dumbbell Shoulder Press" passed, because "shoulder" was in no group. The
 * honest rule is simpler: if one name carries a specifier and the other does
 * not, they are not the same exercise. "Barbell Row" is not "Barbell UPRIGHT
 * Row"; a barbell row is a bent-over pull to the stomach and an upright row
 * is a vertical pull to the chin.
 *
 * Being strict here costs a video on some exercises. That is the cheaper
 * mistake: the caller shows the form cue and no clip, rather than teaching a
 * different movement.
 */
function unmatchedSpecifier(a: string[], b: string[]): string | null {
  const setA = new Set(a.filter((w) => SPECIFIERS.has(w)));
  const setB = new Set(b.filter((w) => SPECIFIERS.has(w)));
  const onlyA = [...setA].filter((w) => !setB.has(w));
  const onlyB = [...setB].filter((w) => !setA.has(w));
  if (!onlyA.length && !onlyB.length) return null;
  if (onlyA.length && onlyB.length) return `${onlyA[0]} vs ${onlyB[0]}`;
  return onlyA.length ? `"${onlyA[0]}" only on one side` : `"${onlyB[0]}" only on one side`;
}

/** The movement: the last word that names an action rather than a qualifier. */
export function movementWord(tokens: string[]): string | null {
  return tokens.length ? tokens[tokens.length - 1] : null;
}

export interface MatchResult {
  /** 0-1 overlap across the union of both names. */
  score: number;
  ok: boolean;
  /** Why it was refused, for a report a human has to read. */
  reason?: string;
}

/** Union-based overlap plus the two veto rules. `threshold` applies to rule 3. */
export function matchExerciseNames(a: string, b: string, threshold = 0.5): MatchResult {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return { score: 0, ok: false, reason: 'no usable words' };

  const setA = new Set(ta);
  const setB = new Set(tb);
  const shared = [...setA].filter((w) => setB.has(w));
  const union = new Set([...setA, ...setB]);
  const score = shared.length / union.size;

  // Identical (after stemming) is always a match, whatever the group rules say.
  if (setA.size === setB.size && shared.length === setA.size) return { score: 1, ok: true };

  const ma = movementWord(ta);
  const mb = movementWord(tb);
  if (ma && mb && ma !== mb && !setB.has(ma) && !setA.has(mb)) {
    return { score, ok: false, reason: `different movement (${ma} vs ${mb})` };
  }

  const clash = unmatchedSpecifier(ta, tb);
  if (clash) return { score, ok: false, reason: `different exercise: ${clash}` };

  if (score < threshold) return { score, ok: false, reason: `only ${Math.round(score * 100)}% of the words in common` };
  return { score, ok: true };
}
