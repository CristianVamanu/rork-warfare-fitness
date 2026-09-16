import { describe, it, expect } from 'vitest';
import { calcActivityXP, validateActivity, isActivityType, activityLabel, ACTIVITY_XP_MAX } from './activity';

describe('activity — XP is modest and capped', () => {
  it('scales with minutes but never past the ceiling', () => {
    expect(calcActivityXP(20)).toBe(50);
    expect(calcActivityXP(45)).toBe(88);
    expect(calcActivityXP(600)).toBe(ACTIVITY_XP_MAX);
    expect(calcActivityXP(100000)).toBe(ACTIVITY_XP_MAX);
  });
  it('a session earns more than any activity can', () => {
    // A real program session can earn several hundred XP; self-reported
    // activity must never compete with it.
    expect(ACTIVITY_XP_MAX).toBeLessThan(300);
  });
  it('never goes negative or NaN', () => {
    expect(calcActivityXP(-5)).toBe(20);
    expect(calcActivityXP(Number.NaN)).toBe(20);
  });
});

describe('activity — validation', () => {
  const today = '2026-09-16';
  it('accepts a normal entry and trims the note', () => {
    const r = validateActivity({ type: 'martial', minutes: 60, note: '  open mat  ', date: '2026-09-15' }, today);
    expect(r).toEqual({ ok: true, value: { type: 'martial', minutes: 60, note: 'open mat', date: '2026-09-15' } });
  });
  it('defaults the date to today and rounds minutes', () => {
    const r = validateActivity({ type: 'run', minutes: 29.6 }, today);
    expect(r.ok && r.value.date).toBe(today);
    expect(r.ok && r.value.minutes).toBe(30);
  });
  it('refuses the future, zero minutes, and unknown types', () => {
    expect(validateActivity({ type: 'run', minutes: 30, date: '2026-09-17' }, today).ok).toBe(false);
    expect(validateActivity({ type: 'run', minutes: 0 }, today).ok).toBe(false);
    expect(validateActivity({ type: 'yoga' as never, minutes: 30 }, today).ok).toBe(false);
  });
  it('caps an over-long note rather than rejecting it', () => {
    const r = validateActivity({ type: 'run', minutes: 30, note: 'x'.repeat(500) }, today);
    expect(r.ok && r.value.note.length).toBe(200);
  });
  it('labels and type guard agree', () => {
    expect(isActivityType('swim')).toBe(true);
    expect(isActivityType('nope')).toBe(false);
    expect(activityLabel('martial')).toBe('Martial arts');
    expect(activityLabel('???')).toBe('Activity');
  });
});
