/**
 * Ripz: tear a pack open, get a bodyweight challenge.
 *
 * Pure rules, no clock and no storage, so the page stays a view and the
 * tests can pin every promise the feature makes:
 *   - the number is always between 20 and 200, in fives, never 0. Most
 *     packs deal 20 to 100; about one in twenty is a Legend pull of 105 to
 *     200, so the big numbers stay rare and worth showing off;
 *   - ripping again never deals the same number for the same move twice in
 *     a row, so "try again" always changes something;
 *   - a new number can be higher or lower than the last one.
 */

export const RIPZ_MIN = 20;
export const RIPZ_MAX = 200;
const STEP = 5;

export interface RipzMove { id: string; name: string; unit: string }

export const RIPZ_MOVES: RipzMove[] = [
  { id: 'push-ups', name: 'Push-ups', unit: 'reps' },
  { id: 'squats', name: 'Bodyweight squats', unit: 'reps' },
  { id: 'sit-ups', name: 'Sit-ups', unit: 'reps' },
  { id: 'lunges', name: 'Lunges', unit: 'reps' },
  { id: 'mountain-climbers', name: 'Mountain climbers', unit: 'reps' },
  // The one pack measured in time. Its count is seconds to hold.
  { id: 'plank', name: 'Plank', unit: 'seconds' },
];

/**
 * The six packs on the wheel. Each colour is a move, so choosing a pack is
 * choosing what you will do; the pack decides how many. The steel pack is
 * the wild card: any move.
 */
export interface RipzPackDef { id: string; label: string; moveId: string | null; colors: [string, string, string] }
export const RIPZ_PACKS: RipzPackDef[] = [
  { id: 'gold', label: 'Push-ups', moveId: 'push-ups', colors: ['#FFC65A', '#F5A623', '#B86A08'] },
  { id: 'blue', label: 'Squats', moveId: 'squats', colors: ['#7CC4FF', '#2F8BFF', '#0B4FB3'] },
  { id: 'green', label: 'Sit-ups', moveId: 'sit-ups', colors: ['#8CF0B0', '#27C46B', '#0C7A3C'] },
  { id: 'red', label: 'Lunges', moveId: 'lunges', colors: ['#FF9A8A', '#F0472F', '#A31A0A'] },
  { id: 'purple', label: 'Mountain climbers', moveId: 'mountain-climbers', colors: ['#D0A6FF', '#9052F0', '#5320A8'] },
  { id: 'teal', label: 'Plank', moveId: 'plank', colors: ['#7FF3E0', '#14B8A6', '#0B6B63'] },
  { id: 'steel', label: 'Wild card', moveId: null, colors: ['#F1F4F8', '#AEB7C2', '#5F6B78'] },
];

export type RipzTier = 'rookie' | 'soldier' | 'veteran' | 'elite' | 'legend';

/** `chance` is how often a pack lands in the tier; they add up to 1. */
export const RIPZ_TIERS: Record<RipzTier, { label: string; min: number; color: string; chance: number }> = {
  rookie: { label: 'Rookie', min: 20, color: '#9CA3AF', chance: 0.35 },
  soldier: { label: 'Soldier', min: 40, color: '#F5A623', chance: 0.3 },
  veteran: { label: 'Veteran', min: 60, color: '#FF6A1F', chance: 0.2 },
  elite: { label: 'Elite', min: 80, color: '#FF3B30', chance: 0.1 },
  legend: { label: 'Legend', min: 105, color: '#C084FC', chance: 0.05 },
};

export function tierFor(count: number): RipzTier {
  return count >= 105 ? 'legend' : count >= 80 ? 'elite' : count >= 60 ? 'veteran' : count >= 40 ? 'soldier' : 'rookie';
}

export interface RipzChallenge { move: RipzMove; count: number; tier: RipzTier }

/** Every value a pack can hold: 20, 25, … 200. */
export const RIPZ_COUNTS: number[] = Array.from({ length: (RIPZ_MAX - RIPZ_MIN) / STEP + 1 }, (_, i) => RIPZ_MIN + i * STEP);

/**
 * Deals one challenge. `rng` returns [0, 1) like Math.random and is passed
 * in so tests are deterministic. `prev` is the challenge on the last pack:
 * the same move with the same number is never dealt straight after it.
 * `moveId` fixes the move (a coloured pack); leave it out for the wild card.
 */
export type RipzLevel = 'beginner' | 'intermediate' | 'advanced';
export const RIPZ_LEVELS: { id: RipzLevel; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
/** How much of the full pull each level is asked for. Advanced is the
 *  original 20 to 200; a beginner gets roughly a quarter, so a first pack is
 *  something like 5 to 25 and still beatable. The tier (Rookie … Legend)
 *  is the pack's rarity and stays the same at every level. */
export const RIPZ_LEVEL_SCALE: Record<RipzLevel, number> = { beginner: 0.25, intermediate: 0.55, advanced: 1 };
/** The smallest and biggest number a level can deal. */
export function levelRange(level: RipzLevel): [number, number] {
  return [scaleCount(RIPZ_MIN, level), scaleCount(RIPZ_MAX, level)];
}
/** A full-scale count brought down to the level, in fives, never under 5. */
export function scaleCount(count: number, level: RipzLevel): number {
  return Math.max(5, Math.round((count * RIPZ_LEVEL_SCALE[level]) / STEP) * STEP);
}
export function isRipzLevel(x: unknown): x is RipzLevel { return x === 'beginner' || x === 'intermediate' || x === 'advanced'; }

/** Seconds a plank pack asks for. The same rarity as a rep pack, on a time
 *  scale: beginner 15–60 s, intermediate 30–120 s, advanced 45–180 s. */
export const PLANK_RANGE: Record<RipzLevel, [number, number]> = { beginner: [15, 60], intermediate: [30, 120], advanced: [45, 180] };
export function plankSeconds(rawCount: number, level: RipzLevel): number {
  const [lo, hi] = PLANK_RANGE[level];
  const k = (Math.min(RIPZ_MAX, Math.max(RIPZ_MIN, rawCount)) - RIPZ_MIN) / (RIPZ_MAX - RIPZ_MIN);
  return Math.round((lo + k * (hi - lo)) / STEP) * STEP;
}
/** "45 seconds" / "45 reps", and a short form for cards. */
export function isTimed(move: { unit?: string } | null | undefined): boolean { return move?.unit === 'seconds'; }

export function rollChallenge(prev: RipzChallenge | null, rng: () => number = Math.random, moveId?: string | null, level: RipzLevel = 'advanced'): RipzChallenge {
  const pick = <T,>(xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
  // The wild card deals any rep move. Plank only comes from its own pack: it
  // needs the timer, so nobody should land on it by surprise.
  const move = (moveId && RIPZ_MOVES.find((m) => m.id === moveId)) || pick(RIPZ_MOVES.filter((m) => m.unit === 'reps'));
  // Tier first, by its odds; then any number inside that tier.
  let roll = rng(); let tier: RipzTier = 'rookie';
  for (const t of Object.keys(RIPZ_TIERS) as RipzTier[]) { tier = t; roll -= RIPZ_TIERS[t].chance; if (roll < 0) break; }
  const inTier = RIPZ_COUNTS.filter((c) => tierFor(c) === tier);
  const final = (c: number) => (isTimed(move) ? plankSeconds(c, level) : scaleCount(c, level));
  const pool = prev && prev.move.id === move.id ? inTier.filter((c) => final(c) !== prev.count) : inTier;
  const raw = pick(pool.length ? pool : inTier);
  return { move, count: final(raw), tier: tierFor(raw) };
}
