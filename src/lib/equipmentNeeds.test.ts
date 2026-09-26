import { describe, it, expect } from 'vitest';
import { inferNeeds, libraryNeeds, missingFor, swapFor, dayNeeds, ownedFor } from './equipmentNeeds';

describe('what an exercise needs', () => {
  it('reads the implement from the name', () => {
    expect(inferNeeds('Barbell Bench Press').sort()).toEqual(['barbell', 'bench']);
    expect(inferNeeds('Dumbbell Bench Press').sort()).toEqual(['bench', 'dumbbells']);
    expect(inferNeeds('Back Squat').sort()).toEqual(['barbell', 'squat-rack']);
    expect(inferNeeds('Goblet Squat')).toEqual([]);
    expect(inferNeeds('Dumbbell Goblet Squat')).toEqual(['dumbbells']);
    expect(inferNeeds('Lat Pulldown')).toEqual(['cable']);
    expect(inferNeeds('Pull-Up')).toEqual(['pull-up-bar']);
    expect(inferNeeds('Leg Press')).toEqual(['machines']);
    expect(inferNeeds('Kettlebell Swing')).toEqual(['kettlebells']);
    expect(inferNeeds('Band Pull-Apart')).toEqual(['bands']);
  });
  it('knows bodyweight when it sees it', () => {
    for (const n of ['Push-Up', 'Plank', '3-Mile Run', 'Burpee', 'Air Squat', 'Walking Lunge', 'Ruck March', 'Mountain Climbers', 'Hanging Leg Raise']) {
      const needs = inferNeeds(n);
      if (n === 'Hanging Leg Raise') expect(needs).toEqual(['pull-up-bar']);
      else expect(needs).toEqual([]);
    }
    expect(inferNeeds('Dumbbell Lunge')).toEqual(['dumbbells']);
  });
  it('prefers the library tags when the admin set them', () => {
    expect(libraryNeeds(['Dumbbell', 'Bench'])?.sort()).toEqual(['bench', 'dumbbells']);
    expect(libraryNeeds(['Bodyweight'])).toEqual([]);
    expect(libraryNeeds(['Mixed'])).toBeNull();
    expect(libraryNeeds([])).toBeNull();
  });
});

describe('missing and swaps', () => {
  it('never warns when the equipment is unknown', () => {
    expect(missingFor(['barbell'], [])).toEqual([]);
    expect(swapFor('Barbell Bench Press', [])).toBeNull();
  });
  it('finds the closest movement the member can do', () => {
    expect(swapFor('Barbell Bench Press', ['dumbbells', 'bench'])?.name).toBe('Dumbbell Bench Press');
    expect(swapFor('Barbell Bench Press', ['dumbbells'])?.name).toBe('Dumbbell Floor Press');
    expect(swapFor('Barbell Bench Press', ['bodyweight'])?.name).toBe('Push-Up');
    expect(swapFor('Lat Pulldown', ['pull-up-bar', 'bands'])?.name).toBe('Pull-Up');
    expect(swapFor('Lat Pulldown', ['bands'])?.name).toBe('Band Lat Pulldown');
    expect(swapFor('Back Squat', ['kettlebells'])?.name).toBe('Kettlebell Goblet Squat');
  });
  it('leaves an exercise alone when it already fits', () => {
    expect(swapFor('Barbell Bench Press', ['barbell', 'bench', 'squat-rack'])).toBeNull();
    expect(swapFor('Push-Up', ['bodyweight'])).toBeNull();
  });
  it('sums a day and resolves the kit mode', () => {
    expect(dayNeeds([{ name: 'Back Squat' }, { name: 'Pull-Up' }, { name: 'Plank' }]).sort()).toEqual(['barbell', 'pull-up-bar', 'squat-rack']);
    expect(ownedFor('bodyweight', ['barbell'])).toEqual(['bodyweight']);
    expect(ownedFor('gym', [])).toContain('cable');
    expect(ownedFor('mine', ['bands'])).toEqual(['bands']);
  });
});
