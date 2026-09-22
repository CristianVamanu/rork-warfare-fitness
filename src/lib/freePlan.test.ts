import { describe, it, expect } from 'vitest';
import { freePlanConfig, findOffer, offerCopy, dripDayFor, dueDripDay, sessionSubject, completionLine, FREE_PLAN_DEFAULTS } from './freePlan';
import type { ProgramDay } from '@/types';

const d = (label: string, isRest = false): ProgramDay => ({ label, isRest, exercises: [] });
const week = [d('Push'), d('Pull'), d('Legs'), d('Rest', true), d('Upper'), d('Lower'), d('Rest', true)];

describe('free plan config', () => {
  it('is off until a program is chosen, even if enabled is ticked', () => {
    expect(freePlanConfig({ freePlan: { enabled: true } }).enabled).toBe(false);
    expect(freePlanConfig({ freePlan: { enabled: true, programId: 'burn-ops' } }).enabled).toBe(true);
  });

  it('only accepts the offered lengths and falls back to seven', () => {
    expect(freePlanConfig({ freePlan: { days: 14 } }).days).toBe(14);
    expect(freePlanConfig({ freePlan: { days: 9 as never } }).days).toBe(7);
    expect(freePlanConfig(null).days).toBe(7);
  });

  it('never shows a blank headline', () => {
    expect(freePlanConfig({ freePlan: { headline: '  ' } }).headline).toBe(FREE_PLAN_DEFAULTS.headline);
  });
});

describe('which session a drip day maps to', () => {
  it('walks phase one\'s week and repeats it, rest days included', () => {
    expect(dripDayFor({ schedule: week }, 1)?.day.label).toBe('Push');
    expect(dripDayFor({ schedule: week }, 4)?.day.isRest).toBe(true);
    expect(dripDayFor({ schedule: week }, 8)?.day.label).toBe('Push');
    expect(dripDayFor({ schedule: week }, 8)?.weekDay).toBe(1);
  });

  it('prefers phase one over the flat schedule when both exist', () => {
    const phased = { schedule: [d('Flat')], phases: [{ id: 'p1', label: 'P1', startWeek: 1, endWeek: 4, schedule: week }] };
    expect(dripDayFor(phased, 1)?.day.label).toBe('Push');
  });

  it('returns null for an empty program or a bad day', () => {
    expect(dripDayFor({ schedule: [] }, 1)).toBeNull();
    expect(dripDayFor({ schedule: week }, 0)).toBeNull();
  });
});

describe('which drip day is due', () => {
  it('sends day 1 immediately and day k after k-1 days', () => {
    expect(dueDripDay(0, {}, 7)).toBe(1);
    expect(dueDripDay(0, { d1: true }, 7)).toBeNull();
    expect(dueDripDay(1, { d1: true }, 7)).toBe(2);
  });

  it('sends one per run, in order, after downtime', () => {
    expect(dueDripDay(5, { d1: true }, 7)).toBe(2);
    expect(dueDripDay(5, { d1: true, d2: true }, 7)).toBe(3);
  });

  it('stops at the plan length', () => {
    const all = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`d${i + 1}`, true]));
    expect(dueDripDay(30, all, 7)).toBeNull();
    expect(dueDripDay(30, {}, 7)).toBe(1);
  });
});

describe('wording', () => {
  it('names the day and the session', () => {
    expect(sessionSubject('Burn Ops', 3, 7, d('Legs'))).toBe('Day 3 of 7: Legs');
    expect(sessionSubject('Burn Ops', 4, 7, d('Rest', true))).toBe('Day 4 of 7: rest day');
  });

  it('describes the free portion in weeks against the whole program', () => {
    expect(completionLine(7, 12)).toMatch(/^You have done a week of a 12-week program/);
    expect(completionLine(14, 13)).toMatch(/^You have done 2 weeks of a 13-week program/);
  });
});

describe('freePlanConfig offers', () => {
  it('reads the legacy single-program shape as one offer', () => {
    const plan = freePlanConfig({ freePlan: { enabled: true, programId: 'a', programName: 'A', headline: 'H', subheadline: 'S' } });
    expect(plan.enabled).toBe(true);
    expect(plan.offers).toEqual([{ id: 'a', name: 'A', headline: 'H', subheadline: 'S' }]);
    expect(plan.programId).toBe('a');
    expect(plan.headline).toBe('H');
  });

  it('dedupes offers, drops blanks, and falls back to the first when the default is not on offer', () => {
    const plan = freePlanConfig({ freePlan: { enabled: true, programId: 'zzz', offers: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }, { id: '', name: 'x' }, { id: 'b', name: 'B' }] } });
    expect(plan.offers.map((o) => o.id)).toEqual(['a', 'b']);
    expect(plan.programId).toBe('a');
    expect(findOffer(plan, 'b')?.name).toBe('B');
    expect(findOffer(plan, 'nope')).toBeNull();
    expect(findOffer(plan, undefined)?.id).toBe('a');
  });

  it('is off with no offers even when enabled is set', () => {
    const plan = freePlanConfig({ freePlan: { enabled: true, offers: [] } });
    expect(plan.enabled).toBe(false);
    expect(findOffer(plan, 'a')).toBeNull();
  });
});

describe('offerCopy', () => {
  const blank = { headline: '', subheadline: '' };
  it('derives the noun from the goal and the length from the days', () => {
    expect(offerCopy(blank, { name: 'Alpha Bulk', goal: 'hypertrophy' }, 7).headline).toBe('Seven days of real muscle-building. Free.');
    expect(offerCopy(blank, { name: 'X', goal: 'strength' }, 14).headline).toBe('Two weeks of real strength work. Free.');
    expect(offerCopy(blank, { name: 'X', goal: 'endurance', recommendedForGoals: ['military-prep'] }, 30).headline).toBe('Thirty days of real selection prep. Free.');
    expect(offerCopy(blank, { name: 'Burn Ops', goal: 'weight-loss' }, 7).subheadline).toContain('straight from Burn Ops');
    expect(offerCopy(blank, { name: 'X', goal: 'general' }, 30).subheadline).toContain('end of the month');
  });
  it('lets the admin copy win', () => {
    expect(offerCopy({ headline: 'Mine', subheadline: 'Also mine' }, { name: 'X', goal: 'strength' }, 7)).toEqual({ headline: 'Mine', subheadline: 'Also mine' });
  });
});
