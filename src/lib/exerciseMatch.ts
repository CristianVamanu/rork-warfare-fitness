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
 *  2. NO CONTRADICTORY MODIFIER. Names carry words that are mutually
 *     exclusive: a movement is overhead or it is a bench press; loaded with a
 *     band or with a cable; seated or standing. If both names name a
 *     different member of the same group, they are different exercises even
 *     when the movement word agrees — which is precisely how "Dumbbell
 *     Overhead Press" ended up showing a decline bench press.
 *  3. ENOUGH OF THE REST IN COMMON, measured over the union of both names
 *     rather than the shorter one, so a short library name can no longer win
 *     on a single shared word.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'for', 'to', 'on', 'of', 'in', 'degree', 'exercises', 'exercise']);

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

export function tokenize(name: string): string[] {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

/**
 * Groups of words that cannot both describe one exercise. Membership of the
 * same group with different values is a contradiction; a word absent from one
 * name is not — plenty of names simply omit the equipment.
 */
const EXCLUSIVE_GROUPS: string[][] = [
  ['band', 'cable', 'dumbbell', 'barbell', 'kettlebell', 'machine', 'lever', 'smith', 'sled'],
  ['overhead', 'bench', 'incline', 'decline', 'floor'],
  ['seated', 'standing', 'lying', 'kneeling', 'hanging'],
  ['front', 'back', 'rear', 'side'],
  ['wide', 'close', 'narrow'],
  ['push', 'pull'],
  ['squat', 'deadlift', 'thrust', 'bridge', 'lunge', 'row', 'press', 'curl', 'raise', 'fly', 'shrug', 'twist', 'crunch', 'extension', 'pulldown', 'pullover'],
];

function conflict(a: string[], b: string[]): string | null {
  const setA = new Set(a);
  const setB = new Set(b);
  for (const group of EXCLUSIVE_GROUPS) {
    const inA = group.filter((w) => setA.has(w));
    const inB = group.filter((w) => setB.has(w));
    if (!inA.length || !inB.length) continue;
    // Any shared member means they agree on this axis.
    if (inA.some((w) => inB.includes(w))) continue;
    return `${inA[0]} vs ${inB[0]}`;
  }
  return null;
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

  const clash = conflict(ta, tb);
  if (clash) return { score, ok: false, reason: `contradictory: ${clash}` };

  if (score < threshold) return { score, ok: false, reason: `only ${Math.round(score * 100)}% of the words in common` };
  return { score, ok: true };
}
