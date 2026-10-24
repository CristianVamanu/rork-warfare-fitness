import { describe, it, expect } from 'vitest';
import { normalizeMatching, readMatching, matchingEqual, describeMatching } from './programMatching';

describe('normalising a program\'s matching fields', () => {
  it('keeps known values and drops junk rather than writing it', () => {
    const m = normalizeMatching({
      level: 'advanced',
      goal: 'weight-loss',
      suitableEquipment: ['home', 'spaceship', 'minimal'],
      recommendedForGoals: ['lose-fat', 'nope'],
      priorityPick: true,
    });
    expect(m).toEqual({
      level: 'advanced',
      goal: 'weight-loss',
      suitableEquipment: ['minimal', 'home'],
      recommendedForGoals: ['lose-fat'],
      ageBrackets: [],
      priorityPick: true,
    });
  });

  it('keeps age brackets, dropping anything that is not one', () => {
    const m = normalizeMatching({ ageBrackets: ['50-plus', '12-17', '40-49'] });
    expect(m.ageBrackets).toEqual(['40-49', '50-plus']);
  });

  it('writes EMPTY ARRAYS for nothing ticked — the clear-on-save bug', () => {
    // The builder used to write undefined here; updateProgram strips
    // undefined, so unticking every chip and saving kept the old list.
    const m = normalizeMatching({ suitableEquipment: [], recommendedForGoals: [] });
    expect(m.suitableEquipment).toEqual([]);
    expect(m.recommendedForGoals).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(m, 'suitableEquipment')).toBe(true);
  });

  it('falls back safely on missing or invalid level/goal', () => {
    const m = normalizeMatching({ level: 'elite', goal: 42 });
    expect(m.level).toBe('intermediate');
    expect(m.goal).toBe('general');
    expect(m.priorityPick).toBe(false);
  });

  it('orders lists canonically and removes duplicates', () => {
    const m = normalizeMatching({
      suitableEquipment: ['full-gym', 'home', 'full-gym'],
      recommendedForGoals: ['strength', 'military-prep', 'strength'],
    });
    expect(m.suitableEquipment).toEqual(['home', 'full-gym']);
    expect(m.recommendedForGoals).toEqual(['military-prep', 'strength']);
  });

  it('reads a real program shape', () => {
    const m = readMatching({ level: 'beginner', goal: 'hypertrophy', priorityPick: false });
    expect(m.level).toBe('beginner');
    expect(m.goal).toBe('hypertrophy');
    expect(m.suitableEquipment).toEqual([]);
  });
});

describe('deciding whether Save has anything to do', () => {
  it('is equal regardless of list order in the input', () => {
    const a = normalizeMatching({ level: 'beginner', goal: 'general', suitableEquipment: ['home', 'minimal'] });
    const b = normalizeMatching({ level: 'beginner', goal: 'general', suitableEquipment: ['minimal', 'home'] });
    expect(matchingEqual(a, b)).toBe(true);
  });

  it('notices a single changed chip', () => {
    const a = normalizeMatching({ recommendedForGoals: ['lose-fat'] });
    const b = normalizeMatching({ recommendedForGoals: ['lose-fat', 'recomposition'] });
    expect(matchingEqual(a, b)).toBe(false);
  });
});

describe('the one-line summary on the list', () => {
  it('shouts when equipment was never set', () => {
    const s = describeMatching(normalizeMatching({}));
    expect(s).toMatch(/Equipment not set/);
    expect(s).toMatch(/matched by category only/);
  });

  it('names what was ticked, in the admin\'s words', () => {
    const s = describeMatching(normalizeMatching({
      suitableEquipment: ['minimal', 'home'],
      recommendedForGoals: ['lose-fat'],
    }));
    expect(s).toBe('Minimal · Home gym. Recommended for Lose Fat.');
  });

  it('says when a program is age-restricted', () => {
    const s = describeMatching(normalizeMatching({ suitableEquipment: ['home'], ageBrackets: ['50-plus'] }));
    expect(s).toMatch(/Ages 50\+ only\.$/);
  });
});
