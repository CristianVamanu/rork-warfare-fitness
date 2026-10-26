import { describe, it, expect } from 'vitest';
import { shouldCelebrate, completionSummary } from './programCompletion';

const base = { finished: true, programId: 'burn-ops', celebrated: [], sessionsDone: 78 };

describe('when to show the completion moment', () => {
  it('shows it on a finished program that was actually trained', () => {
    expect(shouldCelebrate(base)).toBe(true);
  });

  it('stays quiet while the program is still running', () => {
    expect(shouldCelebrate({ ...base, finished: false })).toBe(false);
  });

  it('shows once, then never again for that program', () => {
    expect(shouldCelebrate({ ...base, celebrated: ['burn-ops'] })).toBe(false);
  });

  it('still celebrates a SECOND program', () => {
    // Keyed per program, not a single flag — otherwise every completion
    // after the first is silent, which is backwards.
    expect(shouldCelebrate({ ...base, programId: 'alpha-bulk', celebrated: ['burn-ops'] })).toBe(true);
  });

  it('never congratulates somebody for zero sessions', () => {
    // An empty or schedule-less program reads as instantly "finished".
    expect(shouldCelebrate({ ...base, sessionsDone: 0 })).toBe(false);
  });

  it('does nothing without an active program', () => {
    expect(shouldCelebrate({ ...base, programId: undefined })).toBe(false);
  });

  it('treats a missing celebrated list as nobody celebrated yet', () => {
    expect(shouldCelebrate({ ...base, celebrated: undefined })).toBe(true);
  });
});

describe('what the moment says', () => {
  it('states the program and the numbers, without hype', () => {
    const s = completionSummary({ programName: 'Burn Ops', totalDays: 91, sessionsDone: 78 });
    expect(s.headline).toBe('Burn Ops. Done.');
    expect(s.shareText).toBe('91 days. 78 sessions. Burn Ops — complete.');
    expect(s.shareText).not.toMatch(/crushed|smashed|!/i);
  });

  it('gets the singulars right', () => {
    const s = completionSummary({ programName: 'X', totalDays: 1, sessionsDone: 1 });
    expect(s.shareText).toBe('1 day. 1 session. X — complete.');
  });

  it('omits volume when there is none to show', () => {
    expect(completionSummary({ programName: 'X', totalDays: 30, sessionsDone: 20 }).stats[0].volume)
      .toBeUndefined();
    expect(completionSummary({ programName: 'X', totalDays: 30, sessionsDone: 20, totalVolumeKg: 0 }).stats[0].volume)
      .toBeUndefined();
  });

  it('shows tonnage in the member’s own unit', () => {
    const kg = completionSummary({ programName: 'X', totalDays: 30, sessionsDone: 20, totalVolumeKg: 12500 });
    expect(kg.stats[0].volume).toBe('12.5t');
    const lbs = completionSummary({ programName: 'X', totalDays: 30, sessionsDone: 20, totalVolumeKg: 12500, weightUnit: 'lbs' });
    expect(lbs.stats[0].volume).toMatch(/k lbs$/);
  });

  it('keeps small tonnage readable rather than rounding it to zero tonnes', () => {
    expect(completionSummary({ programName: 'X', totalDays: 7, sessionsDone: 3, totalVolumeKg: 420 }).stats[0].volume)
      .toBe('420 kg');
  });
});
