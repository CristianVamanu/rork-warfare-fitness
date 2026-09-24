import { describe, it, expect } from 'vitest';
import {
  intelBreakFor, athleteLabel, firstName, whyThisFits, offerWords, revealCopy, intakePercent,
  isTrainingFor, isBlocker, intakeAnswerLabel, shortProgramName, DEFAULT_OFFER_STACK, DEFAULT_WHY_PRICE,
} from './onboardingIntake';

describe('intel break', () => {
  it('turns the six answers into five decisions with a reason each', () => {
    const b = intelBreakFor({ trainingFor: 'hybrid', goal: 'lose-fat', experience: 'beginner', trainingDays: 4, equipment: 'minimal' });
    expect(b.rows.map((r) => r.label)).toEqual(['Built around', 'Progression', 'Your week', 'Kit assumed', 'First weeks']);
    expect(b.rows[0].value).toMatch(/Conditioning-led/);
    expect(b.rows[2].value).toMatch(/Four sessions/);
    expect(b.rows[3].value).toMatch(/Bodyweight/);
    for (const r of b.rows) expect(r.why.length).toBeGreaterThan(20);
    expect(b.note).toMatch(/Three questions left/);
  });
  it('only describes what was answered, and still says something for a selection candidate', () => {
    const b = intelBreakFor({ trainingFor: 'selection', goal: null, experience: null, trainingDays: null, equipment: null });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].value).toMatch(/Test events/);
    expect(b.title).toMatch(/so far/);
  });
  it('never claims anything the matcher does not use', () => {
    const b = intelBreakFor({ trainingFor: null, goal: 'strength', experience: 'advanced', trainingDays: 6, equipment: 'full-gym' });
    expect(b.note).not.toMatch(/priority (breaks|decides|picks)/i);
    expect(b.rows[2].value).toMatch(/Six sessions/);
  });
});

describe('reveal words', () => {
  it('names the athlete by goal first, then by tribe', () => {
    expect(athleteLabel('military-prep', 'comeback')).toBe('Selection');
    expect(athleteLabel('recomposition', 'hybrid')).toBe('Hybrid');
    expect(athleteLabel(null, null)).toBe('Recomp');
  });
  it('shortens long program names for the headline', () => {
    expect(shortProgramName('Cali 6: Level Warrior Calisthenics Program')).toBe('Cali 6');
    expect(shortProgramName('Alpha Bulk')).toBe('Alpha Bulk');
    expect(shortProgramName('Legion Endurance Program')).toBe('Legion Endurance');
    expect(shortProgramName('Program')).toBe('Program');
  });
  it('takes the first name and capitalises it', () => {
    expect(firstName('  cristian vamanu ')).toBe('Cristian');
    expect(firstName('')).toBe('');
  });
  it('builds exactly three reasons from the answers, goal first', () => {
    const r = whyThisFits({ goal: 'lose-fat', equipment: 'home', experience: 'intermediate', trainingDays: 4, blocker: 'falling-off', programName: 'Burn Ops' });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/lose fat/);
    expect(r[0]).toMatch(/Burn Ops/);
    expect(r[1]).toMatch(/home-gym/);
    expect(r[2]).toMatch(/counts every day/);
  });
  it('falls back to experience and days when there is no blocker', () => {
    const r = whyThisFits({ goal: 'strength', equipment: null, experience: 'advanced', trainingDays: 5, blocker: null, programName: 'X' });
    expect(r).toHaveLength(3);
    expect(r[1]).toMatch(/Structured progression/);
    expect(r[2]).toMatch(/5 days a week/);
  });
});

describe('offer words', () => {
  const plan = { price: 49, months: 1 };
  it('paid trial: dollar today, price after, three honest boxes', () => {
    const o = offerWords({ enabled: true, trialDays: 30, paidTrialEnabled: true, trialPriceCents: 100 }, plan);
    expect(o.kind).toBe('paid-trial');
    expect(o.button).toBe('Start for $1.00');
    expect(o.line).toBe('$1.00 today · then $49.00/mo · cancel anytime');
    expect(o.boxes.map((b) => b.title)).toEqual(['Today', 'Days 1–30', 'Day 31']);
    expect(o.checkout).toBe(true);
  });
  it('free no-card trial does not go to checkout', () => {
    const o = offerWords({ enabled: true, trialDays: 7 }, plan);
    expect(o.kind).toBe('free-trial');
    expect(o.checkout).toBe(false);
  });
  it('membership off means no offer at all', () => {
    expect(offerWords({ enabled: false }, plan).kind).toBe('none');
    expect(offerWords({ enabled: true }, null).kind).toBe('none');
  });
  it('plain subscription names the price', () => {
    const o = offerWords({ enabled: true, trialDays: 0 }, { price: 99, months: 3 });
    expect(o.button).toBe('Subscribe · $99.00 / 3 months');
  });
});

describe('admin copy and misc', () => {
  it('uses defaults for blank or malformed overrides', () => {
    expect(revealCopy(null).whyPrice).toBe(DEFAULT_WHY_PRICE);
    expect(revealCopy({ onboardingCopy: { whyPrice: '  ', offerStack: [{ title: '' }, 'x'] } }).offerStack).toEqual(DEFAULT_OFFER_STACK);
    expect(revealCopy({ onboardingCopy: { whyPrice: 'Mine', offerStack: [{ title: 'A', body: 'b' }] } })).toEqual({ whyPrice: 'Mine', offerStack: [{ title: 'A', body: 'b' }] });
  });
  it('percent climbs but never reaches 100 before the reveal', () => {
    expect(intakePercent(0, 12)).toBeGreaterThanOrEqual(5);
    expect(intakePercent(11, 12)).toBeLessThanOrEqual(95);
    expect(intakePercent(5, 12)).toBeGreaterThan(intakePercent(2, 12));
  });
  it('labels stored intake answers for the admin card, dash-able when unknown', () => {
    expect(intakeAnswerLabel('trainingFor', 'selection')).toBe('A selection course');
    expect(intakeAnswerLabel('blocker', 'no-time')).toBe('Shift work, no time');
    expect(intakeAnswerLabel('priority', undefined)).toBeNull();
    expect(intakeAnswerLabel('occupation', 'astronaut')).toBeNull();
  });
  it('type guards reject junk', () => {
    expect(isTrainingFor('selection')).toBe(true);
    expect(isTrainingFor('pilot')).toBe(false);
    expect(isBlocker(undefined)).toBe(false);
  });
});
