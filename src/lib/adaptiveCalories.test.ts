import { describe, it, expect } from 'vitest';
import { estimateAdaptive } from './adaptiveCalories';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 30, 12);
const meals = (n: number, kcal: number) => Array.from({ length: n }, (_, i) => ({ at: NOW - i * DAY, kcal }));

describe('estimateAdaptive', () => {
  it('asks for more data first', () => {
    const r = estimateAdaptive(meals(5, 2000), [{ at: NOW, kg: 80 }], 'lose-fat', NOW);
    expect('needs' in r && r.needs).toMatch(/5 more days of food logging and 2 more weigh-ins/);
  });

  it('maintenance equals intake when weight is flat', () => {
    const w = [0, 7, 14, 21].map((d) => ({ at: NOW - d * DAY, kg: 80 }));
    const r = estimateAdaptive(meals(20, 2400), w, 'strength', NOW);
    expect(r).toMatchObject({ maintenance: 2400, target: 2400 });
  });

  it('losing 0.5 kg a week on 2000 kcal means maintenance ≈ 2550', () => {
    const w = [0, 7, 14, 21].map((d) => ({ at: NOW - d * DAY, kg: 80 + (d / 7) * 0.5 }));
    const r = estimateAdaptive(meals(20, 2000), w, 'lose-fat', NOW);
    if ('needs' in r) throw new Error(r.needs);
    expect(r.maintenance).toBe(2550);
    expect(r.kgPerWeek).toBeCloseTo(-0.5, 2);
    expect(r.target).toBe(2040);
  });

  it('ignores half-logged days', () => {
    const w = [0, 7, 14, 21].map((d) => ({ at: NOW - d * DAY, kg: 80 }));
    const r = estimateAdaptive([...meals(12, 2400), ...Array.from({ length: 10 }, (_, i) => ({ at: NOW - (13 + i) * DAY, kcal: 300 }))], w, undefined, NOW);
    if ('needs' in r) throw new Error(r.needs);
    expect(r.loggedDays).toBe(12);
    expect(r.maintenance).toBe(2400);
  });
});
