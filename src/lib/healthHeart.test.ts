import { describe, it, expect } from 'vitest';
import { dropAndroidHeart } from './healthHeart';

describe('dropAndroidHeart', () => {
  const base = { date: '2026-11-13', steps: 5000, avgHeartRate: 93, restingHeartRate: 55, minHeartRate: 40, hrvMs: 30 };
  it('removes heart fields from Health Connect days', () => {
    const d = dropAndroidHeart({ ...base, source: 'healthconnect' });
    expect(d).toEqual({ date: '2026-11-13', steps: 5000, source: 'healthconnect' });
  });
  it('keeps heart fields from Apple Health days', () => {
    expect(dropAndroidHeart({ ...base, source: 'healthkit' }).avgHeartRate).toBe(93);
  });
});
