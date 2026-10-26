import { describe, it, expect } from 'vitest';
import { compareChannels } from './firestore';

describe('channel order', () => {
  it('puts admin-ordered channels first, then the rest by name', () => {
    const list = [
      { name: 'Zulu' }, { name: 'Alpha' },
      { name: 'Ideas', sortOrder: 1 }, { name: 'Start Here', sortOrder: 0 },
    ];
    expect([...list].sort(compareChannels).map((c) => c.name)).toEqual(['Start Here', 'Ideas', 'Alpha', 'Zulu']);
  });
});
