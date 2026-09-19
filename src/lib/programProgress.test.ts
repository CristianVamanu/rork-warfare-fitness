import { describe, it, expect, vi, beforeEach } from 'vitest';
// Static import (not a dynamic await import()) — Vitest hoists vi.mock()
// calls above every import in this file regardless of textual order, so
// the mocked 'firebase/firestore'/'./firebase' are already in place by the
// time this module (and its own top-level imports) actually loads.
import { enrollInProgram, incrementProgramWorkouts, getAllProgramProgress } from './firestore';

// Program-switching regression tests. These exercise enrollInProgram and
// incrementProgramWorkouts against a fake in-memory "Firestore" — a real
// getDoc/updateDoc round trip against a plain object, rather than the
// production SDK — so the actual dotted-path update logic added for
// non-destructive program switching gets verified end to end (does saving
// program A's progress and resuming program B's actually work?), not just
// type-checked.
//
// resolveProgram (called internally by both functions) is left un-mocked
// on purpose: getDoc is set up to reject for any path other than the fake
// user doc, which makes resolveProgram's own internal getDoc call fail and
// fall back to its getMockProgram() lookup — for a programId that isn't a
// real seed program, that resolves to null, and both functions already
// have an approximation fallback for exactly that case. This keeps the
// test deterministic without needing to fake real program schedule data.
//
// Shared mutable fake-DB state lives inside vi.hoisted() — vi.mock factories
// are hoisted above ordinary module-scope const/let, so a plain outer
// variable referenced from inside the factory would throw a
// "used before initialization" error; vi.hoisted() is the supported escape
// hatch for exactly this "shared fake backend" pattern.
const { getUserData, setUserData, DELETE_SENTINEL } = vi.hoisted(() => {
  let userData: Record<string, unknown> = {};
  const SENTINEL = '__DELETE_FIELD__';
  function setDotted(obj: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    const lastKey = parts[parts.length - 1];
    if (value === SENTINEL) delete cur[lastKey];
    else cur[lastKey] = value;
  }
  return {
    getUserData: () => userData,
    setUserData: (next: Record<string, unknown>) => { userData = next; },
    setDottedOnUserData: (path: string, value: unknown) => setDotted(userData, path, value),
    DELETE_SENTINEL: SENTINEL,
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  function setDotted(obj: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
      cur = cur[key] as Record<string, unknown>;
    }
    const lastKey = parts[parts.length - 1];
    if (value === DELETE_SENTINEL) delete cur[lastKey];
    else cur[lastKey] = value;
  }
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
    getDoc: async (ref: string) => {
      if (ref === 'users/test-user') {
        const snapshot = JSON.parse(JSON.stringify(getUserData()));
        return { exists: () => true, data: () => snapshot };
      }
      throw new Error('offline (expected — forces resolveProgram to fall back to null)');
    },
    updateDoc: async (ref: string, data: Record<string, unknown>) => {
      if (ref !== 'users/test-user') throw new Error(`unexpected updateDoc ref: ${ref}`);
      const current = getUserData();
      for (const [path, value] of Object.entries(data)) setDotted(current, path, value);
    },
    setDoc: async (ref: string, data: Record<string, unknown>) => {
      if (ref !== 'users/test-user') throw new Error(`unexpected setDoc ref: ${ref}`);
      const current = getUserData();
      for (const [key, value] of Object.entries(data)) {
        if (value === DELETE_SENTINEL) delete current[key];
        else current[key] = value;
      }
    },
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    deleteField: () => DELETE_SENTINEL,
  };
});

vi.mock('./firebase', () => ({ db: {} }));

const USER_ID = 'test-user';

beforeEach(() => {
  setUserData({});
});

describe('program switching persistence', () => {
  it('Scenario A: switching away and back restores exact position', async () => {
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    // Simulate progressing to absolute day index 25 (e.g. Week 6 Day 3 on a 5-day/week program)
    await incrementProgramWorkouts(USER_ID, 25, 'strength');
    const activeAfterProgress = getUserData().activeProgram as { lastCompletedDayIndex?: number; completedWorkouts?: number };
    expect(activeAfterProgress.lastCompletedDayIndex).toBe(25);
    const strengthWorkoutsDone = activeAfterProgress.completedWorkouts;

    // Switch to a brand-new program
    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });
    expect((getUserData().activeProgram as { programId: string }).programId).toBe('spetsnaz');
    // Strength's progress must be preserved under programProgress, not lost
    const savedStrength = (getUserData().programProgress as Record<string, { lastCompletedDayIndex?: number }>).strength;
    expect(savedStrength).toBeDefined();
    expect(savedStrength.lastCompletedDayIndex).toBe(25);

    // Switch back to Strength
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    const activeAfterSwitchBack = getUserData().activeProgram as { programId: string; lastCompletedDayIndex?: number; completedWorkouts?: number };
    expect(activeAfterSwitchBack.programId).toBe('strength');
    expect(activeAfterSwitchBack.lastCompletedDayIndex).toBe(25);
    expect(activeAfterSwitchBack.completedWorkouts).toBe(strengthWorkoutsDone);
  });

  it('Scenario B: switching to a never-started program starts fresh, old program stays intact', async () => {
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    await incrementProgramWorkouts(USER_ID, 25, 'strength');

    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });
    const active = getUserData().activeProgram as { programId: string; lastCompletedDayIndex?: number; completedWorkouts?: number };
    expect(active.programId).toBe('spetsnaz');
    expect(active.lastCompletedDayIndex).toBeUndefined(); // fresh start, no prior position
    expect(active.completedWorkouts).toBe(0);

    const savedStrength = (getUserData().programProgress as Record<string, { lastCompletedDayIndex?: number }>).strength;
    expect(savedStrength.lastCompletedDayIndex).toBe(25); // untouched by the switch
  });

  it('Scenario C: a stale completion for a program switched away from does not corrupt the now-active program', async () => {
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    await incrementProgramWorkouts(USER_ID, 10, 'strength');
    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });
    await incrementProgramWorkouts(USER_ID, 2, 'spetsnaz');

    // A stale in-flight completion for Strength (started before the switch,
    // resolved after) must not overwrite Spetsnaz's now-active progress.
    await incrementProgramWorkouts(USER_ID, 11, 'strength');

    const active = getUserData().activeProgram as { programId: string; lastCompletedDayIndex?: number };
    expect(active.programId).toBe('spetsnaz');
    expect(active.lastCompletedDayIndex).toBe(2); // unaffected by the stale Strength completion

    const savedStrength = (getUserData().programProgress as Record<string, { lastCompletedDayIndex?: number }>).strength;
    expect(savedStrength.lastCompletedDayIndex).toBe(11); // stale completion still recorded, just not lost
  });

  it('Scenario D: repeatedly switching between 3+ programs never corrupts or overwrites progress', async () => {
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    await incrementProgramWorkouts(USER_ID, 5, 'strength');
    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });
    await incrementProgramWorkouts(USER_ID, 3, 'spetsnaz');
    await enrollInProgram(USER_ID, { id: 'hypertrophy', name: 'Hypertrophy', weeks: 10, daysPerWeek: 6 });
    await incrementProgramWorkouts(USER_ID, 7, 'hypertrophy');

    // Bounce back through all three repeatedly
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });
    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });
    await enrollInProgram(USER_ID, { id: 'hypertrophy', name: 'Hypertrophy', weeks: 10, daysPerWeek: 6 });
    await enrollInProgram(USER_ID, { id: 'strength', name: 'Strength', weeks: 12, daysPerWeek: 5 });

    const all = await getAllProgramProgress(USER_ID);
    expect(all.strength.lastCompletedDayIndex).toBe(5);
    expect(all.spetsnaz.lastCompletedDayIndex).toBe(3);
    expect(all.hypertrophy.lastCompletedDayIndex).toBe(7);
    expect(all.strength.isActive).toBe(true);
    expect(all.spetsnaz.isActive).toBe(false);
    expect(all.hypertrophy.isActive).toBe(false);
  });

  it('Scenario E: an existing user with legacy activeProgram-only data has it captured on their first switch', async () => {
    // Simulates a pre-existing user who never had a programProgress map at
    // all — only the old single activeProgram field.
    setUserData({
      activeProgram: {
        programId: 'strength',
        programName: 'Strength',
        enrolledAt: 'SOME_TS',
        completedWorkouts: 18,
        totalWorkouts: 60,
        lastCompletedDayIndex: 17,
      },
    });

    await enrollInProgram(USER_ID, { id: 'spetsnaz', name: 'Spetsnaz', weeks: 8, daysPerWeek: 4 });

    const savedStrength = (getUserData().programProgress as Record<string, { lastCompletedDayIndex?: number; completedWorkouts?: number }>).strength;
    expect(savedStrength).toBeDefined();
    expect(savedStrength.lastCompletedDayIndex).toBe(17);
    expect(savedStrength.completedWorkouts).toBe(18);
    expect((getUserData().activeProgram as { programId: string }).programId).toBe('spetsnaz');
  });
});
