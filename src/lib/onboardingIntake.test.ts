import { describe, it, expect } from 'vitest';
import {
  intelBreakFor, athleteLabel, firstName, whyThisFits, offerWords, revealCopy, intakePercent,
  isTrainingFor, isBlocker, DEFAULT_OFFER_STACK, DEFAULT_WHY_PRICE,
} from './onboardingIntake';

describe('intel break', () => {
  it('quotes the Ranger entry standard for selection candidates, with a run row', () => {
    const b = intelBreakFor('selection', null);
    expect(b.title).toMatch(/Ranger/);
    expect(b.rows.find((r) => r.label === 'Push-ups')?.value).toBe('53');
    expect(b.rows.find((r) => /run/i.test(r.label))?.value).toBe('14:30');
    expect(b.note.length).toBeGreaterThan(10);
  });
  it('never returns an empty table', () => {
    for (const tf of [null, 'first-responder', 'comeback', 'hybrid'] as const) {
      expect(intelBreakFor(tf, null).rows.length).toBeGreaterThan(0);
    }
  });
});

describe('reveal words', () => {
  it('names the athlete by goal first, then by tribe', () => {
    expect(athleteLabel('military-prep', 'comeback')).toBe('Selection');
    expect(athleteLabel('recomposition', 'hybrid')).toBe('Hybrid');
    expect(athleteLabel(null, null)).toBe('Recomp');
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
  it('type guards reject junk', () => {
    expect(isTrainingFor('selection')).toBe(true);
    expect(isTrainingFor('pilot')).toBe(false);
    expect(isBlocker(undefined)).toBe(false);
  });
});
