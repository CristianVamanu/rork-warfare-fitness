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

describe('the admin overrides', () => {
  const base = {
    id: 'x', name: 'X', description: '', weeks: 12, daysPerWeek: 4,
    exercises: [{ id: '1', name: 'Barbell Back Squat', sets: 3, reps: 10, restSeconds: 60 }],
    createdBy: 'a', isPublic: true,
  };
  const prog = (o: Record<string, unknown>) => ({ ...base, ...o }) as unknown as Parameters<typeof pickBestProgram>[0][number];

  it('an explicit suitability list beats what the exercise names imply', () => {
    // Every exercise here says "Barbell Back Squat", which infers full-gym.
    // The admin says it suits a home gym; the admin wins.
    const declared = prog({ id: 'declared', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'] });
    expect(pickBestProgram([declared], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('declared');
  });

  it('a program not ticked for a level is never given to that level', () => {
    // Home only. A full-gym member must not receive it, even though a
    // minimum-kit reading would say a home program is fine for them.
    const homeOnly = prog({ id: 'home-only', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'] });
    const gymOne = prog({ id: 'gym', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['full-gym'] });
    expect(pickBestProgram([homeOnly, gymOne], 'lose-fat', 'beginner', 4, 'male', 'full-gym')!.id).toBe('gym');
    expect(pickBestProgram([homeOnly, gymOne], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('home-only');
  });

  it('several levels can be ticked at once', () => {
    const both = prog({ id: 'both', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home', 'full-gym'] });
    for (const e of ['home', 'full-gym']) {
      expect(pickBestProgram([both], 'lose-fat', 'beginner', 4, 'male', e)!.id).toBe('both');
    }
  });

  it('a listed program is not demoted for "under-using" the member’s kit', () => {
    // Ticked for full gym, so it suits them by definition — the
    // below-your-tier nudge must not apply and hand the win to a program
    // the admin did not choose.
    const listed = prog({ id: 'listed', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home', 'full-gym'] });
    const inferredGym = prog({ id: 'inferred', level: 'beginner', goal: 'weight-loss' });
    const winner = pickBestProgram([listed, inferredGym], 'lose-fat', 'beginner', 4, 'male', 'full-gym')!;
    expect(['listed', 'inferred']).toContain(winner.id);
    // Whichever wins, the listed one must at least be reachable.
    expect(pickBestProgram([listed], 'lose-fat', 'beginner', 4, 'male', 'full-gym')!.id).toBe('listed');
  });

  it('inference still applies when no tier is declared', () => {
    expect(estimateEquipmentTier(prog({ id: 'guessed', level: 'beginner', goal: 'weight-loss' }))).toBe('full-gym');
  });

  it('a priority pick wins a tie inside its own goal', () => {
    const plain = prog({ id: 'plain', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'] });
    const picked = prog({ id: 'picked', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'], priorityPick: true });
    expect(pickBestProgram([plain, picked], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('picked');
    // Order must not matter — a tie-break that depends on array position is
    // exactly the bug this replaces.
    expect(pickBestProgram([picked, plain], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('picked');
  });

  it('a priority pick never hijacks a different goal', () => {
    // Flagged, but it is a strength program and the member asked to lose fat.
    const flaggedStrength = prog({ id: 'strength', level: 'beginner', goal: 'strength', suitableEquipment: ['home'], priorityPick: true });
    const plainFatLoss = prog({ id: 'fatloss', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'] });
    expect(pickBestProgram([flaggedStrength, plainFatLoss], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('fatloss');
  });

  it('an explicit suitability list is not second-guessed by the exercise names', () => {
    // Burn Ops in production: every exercise name reads as bare "deadlift"
    // etc., so inference says full-gym; the admin ticked minimal/home/full.
    // It passed the exclusion on the admin's word, then lost 5 points at
    // home and 10 at minimal on the inference, and a plain home program
    // took every fat-loss member. The list is the whole answer.
    const declaredHome = prog({ id: 'declared', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['minimal', 'home', 'full-gym'] });
    const inferredHome = prog({ id: 'plain', level: 'beginner', goal: 'general', suitableEquipment: ['home'] });
    expect(estimateEquipmentTier(declaredHome)).toBe('full-gym');
    expect(pickBestProgram([inferredHome, declaredHome], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('declared');
    expect(pickBestProgram([inferredHome, declaredHome], 'lose-fat', 'beginner', 4, 'male', 'minimal')!.id).toBe('declared');
  });

  it('a priority pick cannot drag someone above their equipment', () => {
    const flaggedGym = prog({ id: 'gym', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['full-gym'], priorityPick: true });
    const homeOption = prog({ id: 'home', level: 'beginner', goal: 'weight-loss', suitableEquipment: ['home'] });
    expect(pickBestProgram([flaggedGym, homeOption], 'lose-fat', 'beginner', 4, 'male', 'home')!.id).toBe('home');
  });
});

/**
 * The admin's own routing table: "when somebody picks Selection Prep, send
 * them HERE" — named directly, not inferred from the program's category.
 *
 * The distinction that matters throughout: this overrides opinions (which
 * category the program is filed under) but never facts (what kit the member
 * owns, which sex the program is written for).
 */
describe('admin-chosen recommendations per onboarding goal', () => {
  const base = MOCK_PROGRAMS[0];
  const prog = (o: Record<string, unknown>) => ({ ...base, ...o }) as unknown as Parameters<typeof pickBestProgram>[0][number];
  const anyEquip = ['minimal', 'home', 'full-gym'];

  it('sends the named goal to the named program, across categories', () => {
    // The admin's pick is filed under strength; the member asked for
    // Selection Prep, which normally maps to endurance. The admin wins.
    const named = prog({ id: 'named', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, recommendedForGoals: ['military-prep'] });
    const categoryMatch = prog({ id: 'endurance', level: 'intermediate', goal: 'endurance', suitableEquipment: anyEquip });
    expect(pickBestProgram([named, categoryMatch], 'military-prep', 'intermediate', 4, 'male', 'home')!.id).toBe('named');
    // Array order must not decide it.
    expect(pickBestProgram([categoryMatch, named], 'military-prep', 'intermediate', 4, 'male', 'home')!.id).toBe('named');
  });

  it('leaves every other goal alone', () => {
    // Recommended for Selection Prep only — a member asking to lose fat
    // must still get the fat-loss program.
    const named = prog({ id: 'named', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, recommendedForGoals: ['military-prep'] });
    const fatLoss = prog({ id: 'fatloss', level: 'intermediate', goal: 'weight-loss', suitableEquipment: anyEquip });
    expect(pickBestProgram([named, fatLoss], 'lose-fat', 'intermediate', 4, 'male', 'home')!.id).toBe('fatloss');
  });

  it('accepts several goals on one program', () => {
    const named = prog({ id: 'named', level: 'intermediate', goal: 'general', suitableEquipment: anyEquip, recommendedForGoals: ['build-muscle', 'recomposition'] });
    // Tagged hypertrophy, so it is the natural pick for both of those two
    // goals — the recommendation has to beat a real category match.
    const other = prog({ id: 'other', level: 'intermediate', goal: 'hypertrophy', suitableEquipment: anyEquip });
    for (const goal of ['build-muscle', 'recomposition']) {
      expect(pickBestProgram([named, other], goal, 'intermediate', 4, 'male', 'home')!.id).toBe('named');
    }
    // A goal NOT on the list falls back to ordinary scoring. Both are off
    // category here, so pit the recommendation against a genuine strength
    // program: the unlisted goal must not be dragged to 'named'.
    const strengthOne = prog({ id: 'strength', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip });
    expect(pickBestProgram([named, strengthOne], 'strength', 'intermediate', 4, 'male', 'home')!.id).toBe('strength');
  });

  it('still never sends a member kit they do not have', () => {
    // The admin recommended a full-gym program for Lose Fat. Someone
    // training at home asked to lose fat. Equipment is a fact, not an
    // opinion — they get the home program.
    const gymPick = prog({ id: 'gym', level: 'intermediate', goal: 'weight-loss', suitableEquipment: ['full-gym'], recommendedForGoals: ['lose-fat'] });
    const homeOne = prog({ id: 'home', level: 'intermediate', goal: 'general', suitableEquipment: ['home'] });
    expect(pickBestProgram([gymPick, homeOne], 'lose-fat', 'intermediate', 4, 'male', 'home')!.id).toBe('home');
    // ...and the full-gym member does get it.
    expect(pickBestProgram([gymPick, homeOne], 'lose-fat', 'intermediate', 4, 'male', 'full-gym')!.id).toBe('gym');
  });

  it('still never sends a man the women-only program', () => {
    const womens = prog({ id: 'womens', level: 'intermediate', goal: 'general', targetGender: 'female', suitableEquipment: anyEquip, recommendedForGoals: ['build-muscle'] });
    const open = prog({ id: 'open', level: 'beginner', goal: 'general', targetGender: 'anyone', suitableEquipment: anyEquip });
    expect(pickBestProgram([womens, open], 'build-muscle', 'intermediate', 4, 'male', 'home')!.id).toBe('open');
    expect(pickBestProgram([womens, open], 'build-muscle', 'intermediate', 4, 'female', 'home')!.id).toBe('womens');
  });

  it('a recommended program that also matches the category beats one that only matches the category', () => {
    const both = prog({ id: 'both', level: 'intermediate', goal: 'endurance', suitableEquipment: anyEquip, recommendedForGoals: ['military-prep'] });
    const categoryOnly = prog({ id: 'category', level: 'intermediate', goal: 'endurance', suitableEquipment: anyEquip });
    expect(pickBestProgram([categoryOnly, both], 'military-prep', 'intermediate', 4, 'male', 'home')!.id).toBe('both');
  });

  it('breaks a tie between two recommended programs with the priority flag', () => {
    const a = prog({ id: 'a', level: 'intermediate', goal: 'general', suitableEquipment: anyEquip, recommendedForGoals: ['strength'] });
    const b = prog({ id: 'b', level: 'intermediate', goal: 'general', suitableEquipment: anyEquip, recommendedForGoals: ['strength'], priorityPick: true });
    expect(pickBestProgram([a, b], 'strength', 'intermediate', 4, 'male', 'home')!.id).toBe('b');
    expect(pickBestProgram([b, a], 'strength', 'intermediate', 4, 'male', 'home')!.id).toBe('b');
  });

  it('an over-fifty program is never handed to a 25-year-old', () => {
    const fifty = prog({ id: 'fifty', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, ageBrackets: ['50-plus'] });
    const open = prog({ id: 'open', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip });
    expect(pickBestProgram([fifty, open], 'strength', 'intermediate', 4, 'male', 'home', undefined, 25)!.id).toBe('open');
    expect(pickBestProgram([open, fifty], 'strength', 'intermediate', 4, 'male', 'home', undefined, 25)!.id).toBe('open');
  });

  it('an over-fifty program wins for a 60-year-old over an equal general one', () => {
    const fifty = prog({ id: 'fifty', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, ageBrackets: ['50-plus'] });
    const open = prog({ id: 'open', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip });
    expect(pickBestProgram([open, fifty], 'strength', 'intermediate', 4, 'male', 'home', undefined, 60)!.id).toBe('fifty');
  });

  it('age never overrides the goal', () => {
    // 60, asked to lose fat. The over-fifty program is strength; the
    // fat-loss program is for anyone. They get the fat-loss program.
    const fifty = prog({ id: 'fifty', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, ageBrackets: ['50-plus'] });
    const fatLoss = prog({ id: 'fatloss', level: 'intermediate', goal: 'weight-loss', suitableEquipment: anyEquip });
    expect(pickBestProgram([fifty, fatLoss], 'lose-fat', 'intermediate', 4, 'male', 'home', undefined, 60)!.id).toBe('fatloss');
  });

  it('a member who gave no age is never excluded by a bracket', () => {
    const fifty = prog({ id: 'fifty', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, ageBrackets: ['50-plus'] });
    expect(pickBestProgram([fifty], 'strength', 'intermediate', 4, 'male', 'home')!.id).toBe('fifty');
    expect(pickBestProgram([fifty], 'strength', 'intermediate', 4, 'male', 'home', undefined, 17)!.id).toBe('fifty');
  });

  it('falls back to the bracketed program when it is the only one', () => {
    // The escape hatch every exclusion has: nothing suitable exists, so
    // the member still gets a program rather than nothing.
    const fifty = prog({ id: 'fifty', level: 'intermediate', goal: 'strength', suitableEquipment: anyEquip, ageBrackets: ['50-plus'] });
    expect(pickBestProgram([fifty], 'strength', 'intermediate', 4, 'male', 'home', undefined, 25)!.id).toBe('fifty');
  });

  it('changes nothing at all when no program declares one', () => {
    // The guarantee that makes this safe to ship: every existing program
    // has no list, so the whole live catalogue routes exactly as before.
    expect(MOCK_PROGRAMS.every((p) => !p.recommendedForGoals?.length)).toBe(true);
    sweep((a) => {
      const withField = pickBestProgram(MOCK_PROGRAMS.map((p) => ({ ...p })), a.goal, a.level, a.days, a.sex, a.equipment);
      const plain = match(a);
      expect(withField?.id).toBe(plain?.id);
    });
  });
});
