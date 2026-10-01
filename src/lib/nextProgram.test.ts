import { describe, it, expect } from 'vitest';
import { shouldPlanNext, currentPlan, pickNextProgram, completedProgramIds, stepUp, planLine } from './nextProgram';
import type { Program, NextProgramPlan } from '@/types';

const prog = (id: string, level: Program['level'], goal: Program['goal'], extra: Partial<Program> = {}): Program => ({
  id, name: id, description: '', level, goal, weeks: 8, daysPerWeek: 4, exercises: [], createdBy: 'seed', isPublic: true, ...extra,
});

const plan: NextProgramPlan = { programId: 'b', programName: 'B', weeks: 8, daysPerWeek: 4, forProgramId: 'a', decidedAt: 0, reason: 'matched' };

describe('when to plan the next program', () => {
  it('waits until the last fifth of the program', () => {
    expect(shouldPlanNext({ activeProgramId: 'a', pct: 40, finished: false })).toBe(false);
    expect(shouldPlanNext({ activeProgramId: 'a', pct: 80, finished: false })).toBe(true);
    expect(shouldPlanNext({ activeProgramId: 'a', pct: 10, finished: true })).toBe(true);
  });
  it('does not plan twice for the same program', () => {
    expect(shouldPlanNext({ activeProgramId: 'a', pct: 95, finished: false, plan })).toBe(false);
  });
  it('plans again once the member is on a different program', () => {
    expect(shouldPlanNext({ activeProgramId: 'b', pct: 95, finished: false, plan })).toBe(true);
  });
  it('never plans with no active program', () => {
    expect(shouldPlanNext({ pct: 100, finished: true })).toBe(false);
  });
});

describe('a plan only counts for the program it follows', () => {
  it('returns the plan for its own program and null otherwise', () => {
    expect(currentPlan(plan, 'a')).toBe(plan);
    expect(currentPlan(plan, 'b')).toBeNull();
    expect(currentPlan(undefined, 'a')).toBeNull();
  });
});

describe('picking the next program', () => {
  const pool = [
    prog('a', 'beginner', 'strength'),
    prog('b', 'intermediate', 'strength'),
    prog('c', 'advanced', 'strength'),
    prog('d', 'intermediate', 'hypertrophy'),
  ];
  const base = { pool, completedIds: [], goal: 'strength', experience: 'beginner', trainingDays: 4 };

  it('honours the admin sequel first', () => {
    const r = pickNextProgram({ ...base, current: { id: 'a', level: 'beginner', nextProgramId: 'd' } });
    expect(r?.program.id).toBe('d');
    expect(r?.reason).toBe('sequence');
  });
  it('steps up one level in the same goal when there is no sequel', () => {
    const r = pickNextProgram({ ...base, current: { id: 'a', level: 'beginner' } });
    expect(r?.program.id).toBe('b');
    expect(r?.reason).toBe('matched');
  });
  it('never hands back the program just finished while anything else fits', () => {
    const r = pickNextProgram({ ...base, current: { id: 'b', level: 'intermediate' } });
    expect(r?.program.id).not.toBe('b');
  });
  it('skips programs already completed', () => {
    const r = pickNextProgram({ ...base, current: { id: 'b', level: 'intermediate' }, completedIds: ['c'] });
    expect(r?.program.id).toBe('d');
  });
  it('falls back to a completed one, then to a repeat, rather than nothing', () => {
    const two = [prog('a', 'beginner', 'strength'), prog('b', 'intermediate', 'strength')];
    const r = pickNextProgram({ ...base, pool: two, current: { id: 'b', level: 'intermediate' }, completedIds: ['a'] });
    expect(r?.program.id).toBe('a');
    const one = [prog('a', 'beginner', 'strength')];
    const r2 = pickNextProgram({ ...base, pool: one, current: { id: 'a', level: 'beginner' } });
    expect(r2?.program.id).toBe('a');
    expect(r2?.reason).toBe('repeat');
  });
  it('ignores a sequel that points at itself or no longer exists', () => {
    const r = pickNextProgram({ ...base, current: { id: 'a', level: 'beginner', nextProgramId: 'gone' } });
    expect(r?.program.id).toBe('b');
  });
  it('returns null on an empty pool', () => {
    expect(pickNextProgram({ ...base, pool: [], current: { id: 'a', level: 'beginner' } })).toBeNull();
  });
});

describe('helpers', () => {
  it('steps levels up and caps at advanced', () => {
    expect(stepUp('beginner')).toBe('intermediate');
    expect(stepUp('advanced')).toBe('advanced');
    expect(stepUp(undefined)).toBe('advanced');
  });
  it('reads completed programs from snapshots and the celebrated list', () => {
    expect(completedProgramIds({
      programProgress: { x: { completedWorkouts: 10, totalWorkouts: 10 }, y: { completedWorkouts: 3, totalWorkouts: 10 }, z: { completedWorkouts: 0, totalWorkouts: 0 } },
      celebratedPrograms: ['w'],
    }).sort()).toEqual(['w', 'x']);
  });
  it('phrases the plan by how it was chosen', () => {
    expect(planLine(plan, 84)).toBe('Next phase locked in: B, after day 84.');
    expect(planLine({ ...plan, reason: 'sequence' }, 56)).toContain('Next in the sequence');
  });
});
