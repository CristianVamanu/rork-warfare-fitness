import { describe, it, expect } from 'vitest';
import { trainingMinutesByDay } from './trainingMinutes';
import type { DayMap } from './healthTrends';

const D = '2026-11-12';
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);
const iso = (h: number, m = 0) => at(h, m).toISOString();
const days = (workouts: { type: string; minutes: number; start?: string }[]): DayMap => new Map([[D, { date: D, source: 'healthconnect', workouts }]]) as unknown as DayMap;

describe('trainingMinutesByDay', () => {
  it('counts the same session once when the watch and the app both recorded it', () => {
    // watch 18:00–19:00, app finished 18:55 after 50 min (18:05–18:55)
    const m = trainingMinutesByDay([D], days([{ type: 'strength', minutes: 60, start: iso(18) }]), [{ end: at(18, 55), minutes: 50 }]);
    expect(m.get(D)).toBe(60);
  });
  it('adds separate sessions', () => {
    // morning run on the watch 07:00–07:30, evening gym in the app 18:00–19:00
    const m = trainingMinutesByDay([D], days([{ type: 'running', minutes: 30, start: iso(7) }]), [{ end: at(19), minutes: 60 }]);
    expect(m.get(D)).toBe(90);
  });
  it('counts only the overlapping part once when sessions partly overlap', () => {
    // watch 18:00–18:40, app 18:30–19:10 → union 18:00–19:10 = 70
    const m = trainingMinutesByDay([D], days([{ type: 'strength', minutes: 40, start: iso(18) }]), [{ end: at(19, 10), minutes: 40 }]);
    expect(m.get(D)).toBe(70);
  });
  it('app sessions alone count with no watch', () => {
    expect(trainingMinutesByDay([D], new Map() as DayMap, [{ end: at(9), minutes: 45 }]).get(D)).toBe(45);
  });
  it('watch workouts without a start time never double count with the app', () => {
    const m = trainingMinutesByDay([D], days([{ type: 'strength', minutes: 60 }]), [{ end: at(19), minutes: 55 }]);
    expect(m.get(D)).toBe(60);
  });
  it('splits a session across midnight', () => {
    const prev = '2026-11-11';
    const m = trainingMinutesByDay([prev, D], new Map() as DayMap, [{ end: new Date(2026, 10, 12, 0, 20), minutes: 60 }]);
    expect(m.get(prev)).toBe(40);
    expect(m.get(D)).toBe(20);
  });
  it('zero when nothing was recorded', () => {
    expect(trainingMinutesByDay([D], new Map() as DayMap, []).get(D)).toBe(0);
  });
});
