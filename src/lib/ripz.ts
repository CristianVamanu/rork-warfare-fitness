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
export function rollChallenge(prev: RipzChallenge | null, rng: () => number = Math.random, moveId?: string | null): RipzChallenge {
  const pick = <T,>(xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
  const move = (moveId && RIPZ_MOVES.find((m) => m.id === moveId)) || pick(RIPZ_MOVES);
  // Tier first, by its odds; then any number inside that tier.
  let roll = rng(); let tier: RipzTier = 'rookie';
  for (const t of Object.keys(RIPZ_TIERS) as RipzTier[]) { tier = t; roll -= RIPZ_TIERS[t].chance; if (roll < 0) break; }
  const inTier = RIPZ_COUNTS.filter((c) => tierFor(c) === tier);
  const pool = prev && prev.move.id === move.id ? inTier.filter((c) => c !== prev.count) : inTier;
  const count = pick(pool);
  return { move, count, tier: tierFor(count) };
}
