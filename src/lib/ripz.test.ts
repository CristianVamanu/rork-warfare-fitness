import { describe, it, expect } from 'vitest';
import { rollChallenge, RIPZ_MIN, RIPZ_MAX, RIPZ_COUNTS, RIPZ_PACKS, RIPZ_MOVES, tierFor, type RipzChallenge } from './ripz';

/** Small deterministic generator so a failure reproduces. */
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

describe('ripz', () => {
  it('always deals 20 to 200 in fives, never 0', () => {
    const rng = seeded(1);
    let prev: RipzChallenge | null = null;
    for (let i = 0; i < 5000; i++) {
      const c = rollChallenge(prev, rng);
      expect(c.count).toBeGreaterThanOrEqual(RIPZ_MIN);
      expect(c.count).toBeLessThanOrEqual(RIPZ_MAX);
      expect(c.count % 5).toBe(0);
      prev = c;
    }
  });
  it('never repeats the same move and number back to back', () => {
    const rng = seeded(7);
    let prev = rollChallenge(null, rng);
    for (let i = 0; i < 5000; i++) {
      const c = rollChallenge(prev, rng);
      expect(c.move.id === prev.move.id && c.count === prev.count).toBe(false);
      prev = c;
    }
  });
  it('can go both higher and lower than the last pack', () => {
    const rng = seeded(3);
    let prev = rollChallenge(null, rng); let up = 0; let down = 0;
    for (let i = 0; i < 500; i++) { const c = rollChallenge(prev, rng); if (c.count > prev.count) up++; if (c.count < prev.count) down++; prev = c; }
    expect(up).toBeGreaterThan(50); expect(down).toBeGreaterThan(50);
  });
  it('holds at the edges of the generator', () => {
    expect(rollChallenge(null, () => 0).count).toBe(RIPZ_MIN);
    expect(rollChallenge(null, () => 0.999999).count).toBe(RIPZ_MAX);
    expect(RIPZ_COUNTS).toHaveLength(37);
  });
  it('keeps the big numbers rare: most packs are 100 or under, about 1 in 20 is a Legend', () => {
    const rng = seeded(5); let legend = 0; let prev: RipzChallenge | null = null; const N = 20000;
    for (let i = 0; i < N; i++) { const c = rollChallenge(prev, rng); if (c.count > 100) { legend++; expect(c.tier).toBe('legend'); } prev = c; }
    expect(legend / N).toBeGreaterThan(0.035); expect(legend / N).toBeLessThan(0.065);
  });
  it('a coloured pack always deals its own move, and never the same number twice running', () => {
    const rng = seeded(11);
    for (const pack of RIPZ_PACKS.filter((p) => p.moveId)) {
      expect(RIPZ_MOVES.some((m) => m.id === pack.moveId)).toBe(true);
      let prev = rollChallenge(null, rng, pack.moveId);
      for (let i = 0; i < 300; i++) {
        const c = rollChallenge(prev, rng, pack.moveId);
        expect(c.move.id).toBe(pack.moveId); expect(c.count).not.toBe(prev.count); expect(c.count).toBeGreaterThanOrEqual(RIPZ_MIN);
        prev = c;
      }
    }
    expect(RIPZ_PACKS).toHaveLength(6);
  });
  it('tiers by size', () => {
    expect([20, 39, 40, 60, 80, 100, 105, 200].map(tierFor)).toEqual(['rookie', 'rookie', 'soldier', 'veteran', 'elite', 'elite', 'legend', 'legend']);
  });
});
