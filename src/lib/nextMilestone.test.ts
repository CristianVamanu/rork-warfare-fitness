import { describe, it, expect } from 'vitest';
import { pickNextMilestone, milestoneCandidates, NEAR_ENOUGH, type MilestoneInput } from './nextMilestone';
import { ACHIEVEMENT_DEFS } from './achievements';

const base: MilestoneInput = {
  totalWorkouts: 0,
  streak: 0,
  powerLevel: 1,
  totalWeightLifted: 0,
  totalMealsLogged: 0,
  xp: 0,
  earnedAchievements: [],
  completedQuests: [],
};

const input = (over: Partial<MilestoneInput>): MilestoneInput => ({ ...base, ...over });

describe('pickNextMilestone', () => {
  it('falls back to power level for a brand-new account', () => {
    const m = pickNextMilestone(base);
    expect(m.kind).toBe('level');
    expect(m.href).toBe('/progress');
  });

  it('never returns an empty or 100% strip on the fallback', () => {
    // xp 0 -> 0/100 toward the next level. Still a live bar, not a blank one.
    const m = pickNextMilestone(input({ xp: 0 }));
    expect(m.progress).toBeGreaterThanOrEqual(0);
    expect(m.progress).toBeLessThan(1);
    expect(m.detail).toContain('XP');
  });

  it('shows the fallback rather than a barely-started milestone', () => {
    // Sitting between rungs: 16 workouts is past the 15 rung and only 53% of
    // the way to the 30 one, power level 13 is 52% of the way to 25, and every
    // quest is blocked on a stat still at zero. Nothing is close, so the strip
    // must fall back to the level bar rather than show someone how far they
    // aren't.
    const m = pickNextMilestone(input({ totalWorkouts: 16, xp: 1250, powerLevel: 13, streak: 0 }));
    expect(m.kind).toBe('level');
  });

  it('surfaces a nearly-complete achievement over the level bar', () => {
    // 28 of 30 workouts -> the 'Committed' achievement at ~93%.
    const m = pickNextMilestone(input({ totalWorkouts: 28, xp: 1250, powerLevel: 13 }));
    expect(m.kind).not.toBe('level');
    expect(m.progress).toBeGreaterThanOrEqual(NEAR_ENOUGH);
  });

  it('prefers the closest of several eligible milestones', () => {
    const m = pickNextMilestone(input({ totalWorkouts: 29, streak: 4, powerLevel: 24, xp: 2400 }));
    const eligible = milestoneCandidates(input({ totalWorkouts: 29, streak: 4, powerLevel: 24, xp: 2400 }))
      .filter((c) => c.progress >= NEAR_ENOUGH);
    expect(eligible.length).toBeGreaterThan(1);
    expect(m.progress).toBe(Math.max(...eligible.map((c) => c.progress)));
  });

  it('never offers an already-earned achievement', () => {
    const earned = ACHIEVEMENT_DEFS.map((d) => d.id);
    const cands = milestoneCandidates(input({ totalWorkouts: 28, earnedAchievements: earned }));
    expect(cands.every((c) => c.kind !== 'achievement')).toBe(true);
  });

  it('never offers an already-completed quest', () => {
    const all = milestoneCandidates(input({ totalWorkouts: 4, streak: 2 }));
    const questIds = all.filter((c) => c.kind === 'quest').map((c) => c.title);
    expect(questIds.length).toBeGreaterThan(0);
    // first_blood is the quest those stats are partway through.
    const done = milestoneCandidates(input({ totalWorkouts: 4, streak: 2, completedQuests: ['first_blood'] }));
    expect(done.filter((c) => c.kind === 'quest').map((c) => c.title)).not.toContain('First Blood');
  });

  it('excludes boolean achievements, which have no "how close" concept', () => {
    // Early Bird / Weekend Warrior / Night Owl are earned by a single event,
    // so they must never appear as a partial-progress milestone.
    const cands = milestoneCandidates(input({ totalWorkouts: 28, streak: 13 }));
    for (const title of ['Early Bird', 'Night Owl', 'Weekend Warrior', 'Graveyard Shift', 'Fuel Up']) {
      expect(cands.map((c) => c.title)).not.toContain(title);
    }
  });

  it('rates a quest by its worst requirement, not its average', () => {
    // iron_warrior needs 40,000kg volume AND 30 workouts AND power level 25.
    // Volume is untouched here, so the quest must read as ~0 and be excluded
    // rather than looking two-thirds done.
    const cands = milestoneCandidates(input({ totalWorkouts: 30, powerLevel: 25, totalWeightLifted: 0 }));
    expect(cands.map((c) => c.title)).not.toContain('Iron Warrior');
  });

  it('reports the binding requirement in the detail line', () => {
    const cands = milestoneCandidates(input({ totalWorkouts: 29, totalWeightLifted: 39000, powerLevel: 25 }));
    const iron = cands.find((c) => c.title === 'Iron Warrior');
    expect(iron).toBeDefined();
    // 29/30 workouts (96.7%) beats 39000/40000 volume (97.5%)? No — volume is
    // higher, so workouts is the worst and must be the one named.
    expect(iron!.detail).toContain('30');
  });

  it('is stable — repeated calls with the same stats pick the same thing', () => {
    const stats = input({ totalWorkouts: 29, streak: 13, powerLevel: 24, xp: 2400 });
    const a = pickNextMilestone(stats);
    const b = pickNextMilestone(stats);
    expect(a.title).toBe(b.title);
  });
});
