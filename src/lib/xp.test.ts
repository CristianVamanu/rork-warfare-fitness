import { describe, it, expect } from 'vitest';
import { xpToPowerLevel, xpToNextLevel, calcWorkoutXP } from './xp';

describe('xpToPowerLevel', () => {
  // The regression this guards: signup seeds powerLevel to 1, but the
  // formula used to return floor(xp/100) — 0 for anyone under 100 XP — so a
  // new user's first workout DROPPED them from Level 1 to Level 0.
  it('starts a brand-new account at level 1, matching the signup seed', () => {
    expect(xpToPowerLevel(0)).toBe(1);
  });

  it('never drops below the starting level after a first sub-100-XP workout', () => {
    expect(xpToPowerLevel(80)).toBe(1);
  });

  it('ticks over exactly every 100 XP', () => {
    expect(xpToPowerLevel(99)).toBe(1);
    expect(xpToPowerLevel(100)).toBe(2);
    expect(xpToPowerLevel(199)).toBe(2);
    expect(xpToPowerLevel(200)).toBe(3);
  });

  it('stays in lockstep with the next-level progress bar', () => {
    // The bar filling to `needed` must coincide with the level changing —
    // otherwise progress visibly resets without a level-up (or vice versa).
    for (const xp of [0, 50, 99, 100, 150, 199, 200, 640]) {
      const { current, needed } = xpToNextLevel(xp);
      expect(xpToPowerLevel(xp + (needed - current))).toBe(xpToPowerLevel(xp) + 1);
    }
  });
});

describe('calcWorkoutXP', () => {
  it('caps the volume contribution so one huge session cannot dominate', () => {
    // Volume term is min(kg/50, 50) — 5000kg already hits the cap, so
    // 50000kg must not award ten times as much.
    expect(calcWorkoutXP(0, 0, 5000)).toBe(calcWorkoutXP(0, 0, 50000));
  });

  it('scores a realistic session in a sane range', () => {
    // 45 min, 20 sets, 3000kg → 225 + 200 + 50 (capped at 3000/50=60→50)
    expect(calcWorkoutXP(45, 20, 3000)).toBe(475);
  });
});
