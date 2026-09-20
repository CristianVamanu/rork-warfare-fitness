import { describe, it, expect } from 'vitest';
import { MOCK_PROGRAMS, pickBestProgram, estimateEquipmentTier } from './programs';

/**
 * Invariants for the onboarding matcher, swept across every combination of
 * answers the quiz can produce.
 *
 * The matcher is the single most consequential piece of logic in the
 * product — it decides what a paying member trains for the next three
 * months, from six answers, with no human in the loop. Previously nothing
 * asserted anything about it beyond a handful of hand-picked cases, and it
 * has already shipped one serious defect (handing men the women's program
 * in 8 of 96 combinations) that only surfaced by simulating the catalogue.
 *
 * These are properties, not fixtures: they hold for any catalogue, so they
 * keep holding as programs are added, renamed or retired.
 */

const GOALS = ['military-prep', 'lose-fat', 'build-muscle', 'recomposition', 'strength'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DAYS = [3, 4, 5, 6];
const SEXES = ['male', 'female'];
const EQUIPMENT = ['minimal', 'home', 'full-gym'];
const RANK: Record<string, number> = { minimal: 0, home: 1, 'full-gym': 2 };

function sweep(fn: (a: { goal: string; level: string; days: number; sex: string; equipment: string }) => void) {
  for (const goal of GOALS)
    for (const level of LEVELS)
      for (const days of DAYS)
        for (const sex of SEXES)
          for (const equipment of EQUIPMENT) fn({ goal, level, days, sex, equipment });
}

const match = (a: { goal: string; level: string; days: number; sex: string; equipment: string }) =>
  pickBestProgram(MOCK_PROGRAMS, a.goal, a.level, a.days, a.sex, a.equipment, undefined);

describe('the onboarding matcher, over every answer combination', () => {
  it('always assigns a program — nobody finishes the quiz with nothing', () => {
    const failures: string[] = [];
    sweep((a) => { if (!match(a)) failures.push(JSON.stringify(a)); });
    expect(failures).toEqual([]);
  });

  it('never hands someone a program written for the other sex', () => {
    const failures: string[] = [];
    sweep((a) => {
      const p = match(a);
      if (!p) return;
      const wrong = !!p.targetGender && p.targetGender !== 'anyone' && p.targetGender !== a.sex;
      // Only a failure when something suitable existed to pick instead.
      const alternative = MOCK_PROGRAMS.some(
        (c) => !c.targetGender || c.targetGender === 'anyone' || c.targetGender === a.sex,
      );
      if (wrong && alternative) failures.push(`${JSON.stringify(a)} -> ${p.id} (${p.targetGender})`);
    });
    expect(failures).toEqual([]);
  });

  /**
   * Was 92 of 360 before equipment became an exclusion rather than a -5
   * penalty — better than a quarter of members handed a program demanding
   * kit they had just said they do not own. Zero now, and it must stay
   * zero: the only way back is a program above their tier winning while
   * something they could actually do sits unused in the catalogue.
   */
  it('never demands equipment the member said they do not have, when an alternative fits', () => {
    const failures: string[] = [];
    sweep((a) => {
      const p = match(a);
      if (!p) return;
      const needs = RANK[estimateEquipmentTier(p)] ?? 0;
      if (needs <= RANK[a.equipment]) return;
      // Was there a same-goal program they could actually have done?
      const reachable = MOCK_PROGRAMS.some(
        (c) => (RANK[estimateEquipmentTier(c)] ?? 0) <= RANK[a.equipment]
          && (!c.targetGender || c.targetGender === 'anyone' || c.targetGender === a.sex),
      );
      if (reachable) failures.push(`${JSON.stringify(a)} -> ${p.id} needs ${estimateEquipmentTier(p)}`);
    });
    expect(failures).toEqual([]);
  });

  it('is deterministic — the same answers always give the same program', () => {
    sweep((a) => { expect(match(a)!.id).toBe(match(a)!.id); });
  });

  it('never assigns a program the catalogue does not contain', () => {
    const ids = new Set(MOCK_PROGRAMS.map((p) => p.id));
    sweep((a) => { expect(ids.has(match(a)!.id)).toBe(true); });
  });
});
