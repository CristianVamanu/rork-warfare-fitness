import { describe, it, expect } from 'vitest';
import { pickCardHeadline } from './cardHeadline';

const base = {
  newAchievementTitles: [] as string[],
  streak: 0,
  powerLevel: 32,
  levelTitle: 'Focused',
  completedSets: 24,
  durationMinutes: 47,
};

describe('pickCardHeadline', () => {
  it('leads with an achievement when one was unlocked — the rarest thing', () => {
    const h = pickCardHeadline({ ...base, newAchievementTitles: ['Century Club'], streak: 9 });
    expect(h.headline).toBe('Century Club');
    expect(h.sub).toBe('Achievement unlocked');
    expect(h.glyph).toBe('🏆');
  });

  it('counts the extras when several unlocked at once', () => {
    const h = pickCardHeadline({ ...base, newAchievementTitles: ['Century Club', 'Iron Will', 'Dawn Raider'] });
    expect(h.headline).toBe('Century Club');
    expect(h.sub).toBe('Unlocked · +2 more this session');
  });

  it('falls to the streak when nothing was unlocked', () => {
    const h = pickCardHeadline({ ...base, streak: 4 });
    expect(h.headline).toBe('4 days in a row');
    expect(h.glyph).toBe('🔥');
  });

  it('refuses to call a single day a streak', () => {
    // "1 day in a row" is just "today" — the exact kind of empty flourish
    // this module exists to avoid.
    const h = pickCardHeadline({ ...base, streak: 1 });
    expect(h.headline).toBe('Level 32');
    expect(h.glyph).toBe('⚡');
  });

  it('two days is the smallest real streak', () => {
    expect(pickCardHeadline({ ...base, streak: 2 }).headline).toBe('2 days in a row');
  });

  it('falls back to the session itself, stated plainly', () => {
    const h = pickCardHeadline(base);
    expect(h.headline).toBe('Level 32');
    expect(h.sub).toBe('Focused · 24 sets in 47 min');
  });

  it('always returns something renderable — never an empty headline', () => {
    const cases = [
      base,
      { ...base, streak: 0, powerLevel: 1, levelTitle: '', completedSets: 0, durationMinutes: 0 },
      { ...base, newAchievementTitles: [''] },
    ];
    for (const c of cases) {
      const h = pickCardHeadline(c);
      expect(typeof h.headline).toBe('string');
      expect(h.glyph.length).toBeGreaterThan(0);
    }
  });
});
