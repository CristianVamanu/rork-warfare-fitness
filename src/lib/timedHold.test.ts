import { describe, it, expect } from 'vitest';
import { isCardioName, cardioSecondsFromReps, isTimedHoldName, holdSecondsFromReps, explicitSeconds, isTimedHold, formatHoldSeconds } from './timedHold';

describe('timedHold', () => {
  it('recognises holds by name', () => {
    for (const n of ['Plank', 'Side Plank', 'Forearm Plank', 'RKC Plank', 'Wall Sit', 'Dead Hang', 'Hollow Body Hold', 'L-Sit', 'Plank Hold']) expect(isTimedHoldName(n)).toBe(true);
  });
  it('does not treat moving plank variations or lifts as holds', () => {
    for (const n of ['Plank Row', 'Plank Jack', 'Kettlebell Plank Pass Through', 'Plank Shoulder Tap', 'Barbell Back Squat', 'Push-Up']) expect(isTimedHoldName(n)).toBe(false);
  });
  it('reads seconds from reps', () => {
    expect(holdSecondsFromReps(30)).toBe(30);
    expect(holdSecondsFromReps('30')).toBe(30);
    expect(holdSecondsFromReps('45s')).toBe(45);
    expect(holdSecondsFromReps('1 min')).toBe(60);
    expect(holdSecondsFromReps('20 each side')).toBe(20);
    expect(holdSecondsFromReps('30-45')).toBe(30);
    expect(holdSecondsFromReps('')).toBe(30);
  });
  it('only calls a duration explicit when it has a unit', () => {
    expect(explicitSeconds('30s')).toBe(30);
    expect(explicitSeconds('30')).toBeNull();
    expect(explicitSeconds(30)).toBeNull();
    expect(explicitSeconds('8-12')).toBeNull();
  });
  it('flags timed holds, not rep work or distances', () => {
    expect(isTimedHold({ name: 'Plank', reps: 30 })).toBe(true);
    expect(isTimedHold({ name: 'Bear Crawl', reps: '30s' })).toBe(true);
    expect(isTimedHold({ name: 'Squat', reps: '8-12' })).toBe(false);
    expect(isTimedHold({ name: 'Run', reps: '400m' })).toBe(false);
  });
  it('formats', () => { expect(formatHoldSeconds(30)).toBe('30s'); expect(formatHoldSeconds(60)).toBe('1 min'); expect(formatHoldSeconds(90)).toBe('1 min 30s'); });
  it('recognises cardio by name, not rows or lunges', () => {
    for (const n of ['Stationary Bike', 'Easy Run', 'Treadmill Running', 'Rowing Machine', 'Jump Rope', 'Assault Bike Sprints']) expect(isCardioName(n)).toBe(true);
    for (const n of ['Barbell Row', 'Dumbbell Row', 'Walking Lunge', 'Cable Row', 'Squat']) expect(isCardioName(n)).toBe(false);
  });
  it('reads a cardio duration', () => {
    expect(cardioSecondsFromReps('20 min', 1)).toBe(1200);
    expect(cardioSecondsFromReps('20', 1)).toBe(1200);
    expect(cardioSecondsFromReps(30, 8)).toBe(30);
    expect(cardioSecondsFromReps('45s', 6)).toBe(45);
    expect(cardioSecondsFromReps('', 1)).toBe(600);
  });
});
