import { describe, it, expect } from 'vitest';
import { matchesDetectedEquipment as m } from './scanEquipmentMatch';

describe('matchesDetectedEquipment', () => {
  const list = ['Hack squat machine', 'Plate-loaded shoulder press', 'Chest-supported row machine', 'Dumbbells'];
  it('accepts bodyweight', () => { expect(m('bodyweight', list)).toBe(true); expect(m(undefined, list)).toBe(true); });
  it('accepts exact and contained names', () => { expect(m('Hack squat machine', list)).toBe(true); expect(m('hack squat', list)).toBe(true); });
  it('accepts a reworded name for the same machine', () => {
    expect(m('Shoulder press machine', list)).toBe(true);
    expect(m('Chest supported row (plate loaded)', list)).toBe(true);
    expect(m('dumbbell', list)).toBe(true);
  });
  it('rejects equipment that was not detected', () => {
    expect(m('Leg press', list)).toBe(false);
    expect(m('Lat pulldown machine', list)).toBe(false);
    expect(m('Chest press machine', list)).toBe(false);
    expect(m('machine', list)).toBe(false);
  });
});
