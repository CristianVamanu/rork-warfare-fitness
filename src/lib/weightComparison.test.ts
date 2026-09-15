import { describe, it, expect } from 'vitest';
import { pickWeightComparison, comparisonPhrase, COMPARISON_OBJECTS } from './weightComparison';

describe('pickWeightComparison', () => {
  it('returns null below the comparable floor — a bodyweight-only session', () => {
    expect(pickWeightComparison(0)).toBeNull();
    expect(pickWeightComparison(10)).toBeNull();
  });

  it('rejects non-finite input rather than crashing on it', () => {
    expect(pickWeightComparison(NaN)).toBeNull();
    expect(pickWeightComparison(Infinity)).toBeNull();
  });

  it('picks the LARGEST object the total clears, not just any eligible one', () => {
    // 1300kg clears everything up to and including small-car (1200) —
    // small-car is the largest, regardless of the table's own ordering.
    const c = pickWeightComparison(1300, 1);
    expect(c?.object.id).toBe('small-car');
    expect(c?.count).toBe(1);
  });

  it('is correct at a weight only one entry can possibly explain', () => {
    // Nothing else in the table sits within 15% of grizzly (360) below it
    // (motorbike, the next one down, is 220 — a 39% gap) or of small-car
    // (1200) below it (grand-piano at 480 is a 60% gap), so these totals
    // have exactly one honest answer, with no tie-break ambiguity.
    expect(pickWeightComparison(400, 1)?.object.id).toBe('grizzly');
    expect(pickWeightComparison(1300, 1)?.object.id).toBe('small-car');
  });

  it('lion and piano are close enough (200 vs 190, a 5% gap) to legitimately tie', () => {
    // Not a bug: two objects this close in real-world weight are equally
    // honest either way, so a total that best-matches piano may resolve to
    // either — but only ever piano or lion, never something further away.
    const c = pickWeightComparison(205, 1);
    expect(['piano', 'lion']).toContain(c?.object.id);
  });

  it('counts whole multiples, and the largest-object rule outranks a bigger count', () => {
    // 850kg clears giraffe (800) once, and grizzly (360) more than twice —
    // the largest OBJECT still wins over a higher count of a smaller one.
    const c = pickWeightComparison(850, 1);
    expect(c?.object.id).toBe('giraffe');
    expect(c?.count).toBe(1);
  });

  it('the count itself floors rather than rounds', () => {
    // 29,999kg is a whisker short of helicopter x2 (30,000) and still well
    // under blue-whale (150,000) — must report count 1, not 2.
    const c = pickWeightComparison(29999, 1);
    expect(c?.object.id).toBe('helicopter');
    expect(c?.count).toBe(1);
  });

  it('a genuinely huge total still resolves to the top tier, not undefined', () => {
    const c = pickWeightComparison(500000, 1);
    expect(c?.object.id).toBe('blue-whale');
    expect(c!.count).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for a given total — same input, same output, every call', () => {
    const results = Array.from({ length: 20 }, () => pickWeightComparison(1300, 42));
    const ids = new Set(results.map((r) => r?.object.id));
    expect(ids.size).toBe(1);
  });

  it('every object in the table is reachable at some total', () => {
    const reached = new Set<string>();
    for (const o of COMPARISON_OBJECTS) {
      const c = pickWeightComparison(o.weightKg, o.weightKg);
      if (c) reached.add(c.object.id);
    }
    // Near-identical-weight objects can tie-break to each other rather than
    // themselves (that's the intended behaviour), so this checks coverage
    // is broad, not that every single id is hit at its own exact weight.
    expect(reached.size).toBeGreaterThan(COMPARISON_OBJECTS.length * 0.6);
  });
});

describe('comparisonPhrase', () => {
  it('singular uses "a" or "an" correctly', () => {
    expect(comparisonPhrase({ object: COMPARISON_OBJECTS.find((o) => o.id === 'elephant')!, count: 1 }))
      .toBe('the weight of an elephant');
    expect(comparisonPhrase({ object: COMPARISON_OBJECTS.find((o) => o.id === 'grizzly')!, count: 1 }))
      .toBe('the weight of a grizzly bear');
  });

  it('pluralizes "bus" correctly — the bug this test exists to catch', () => {
    expect(comparisonPhrase({ object: COMPARISON_OBJECTS.find((o) => o.id === 'school-bus')!, count: 3 }))
      .toBe('the weight of 3 school buses');
  });

  it('pluralizes "T-Rex" correctly', () => {
    expect(comparisonPhrase({ object: COMPARISON_OBJECTS.find((o) => o.id === 't-rex')!, count: 2 }))
      .toBe('the weight of 2 T-Rexes');
  });

  it('pluralizes an ordinary noun with a plain "s"', () => {
    expect(comparisonPhrase({ object: COMPARISON_OBJECTS.find((o) => o.id === 'small-car')!, count: 4 }))
      .toBe('the weight of 4 small cars');
  });
});
