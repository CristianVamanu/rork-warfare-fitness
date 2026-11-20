import { describe, it, expect } from 'vitest';
import { isCoachingProgram, memberHasCoachingProgram } from './coachingPrograms';
import { selectPublicPrograms } from './firestore';

describe('1-to-1 coaching programs', () => {
  it('are recognised by visibility, whatever isPublic says', () => {
    expect(isCoachingProgram({ visibility: 'coaching' })).toBe(true);
    expect(isCoachingProgram({ visibility: 'public' })).toBe(false);
    expect(isCoachingProgram({})).toBe(false);
    expect(isCoachingProgram(null)).toBe(false);
  });
  it('never appear in the browse list, even when published as public', () => {
    const list = selectPublicPrograms([
      { id: 'a', name: 'Alpha', isPublic: true, visibility: 'public' },
      { id: 'c', name: 'Client plan', isPublic: true, visibility: 'coaching' },
      { id: 'd', name: 'Draft', isPublic: false },
    ]) as { id: string }[];
    expect(list.map((p) => p.id)).toEqual(['a']);
  });
  it('are visible to the member only once a trainer has put them on it', () => {
    expect(memberHasCoachingProgram({ activeProgram: { programId: 'c' } }, 'c')).toBe(true);
    expect(memberHasCoachingProgram({ activeProgram: { programId: 'a' }, programProgress: { c: {} } }, 'c')).toBe(true);
    expect(memberHasCoachingProgram({ activeProgram: { programId: 'a' } }, 'c')).toBe(false);
    expect(memberHasCoachingProgram(null, 'c')).toBe(false);
  });
});
