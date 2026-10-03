import { describe, it, expect } from 'vitest';
import { toggleEquipment, equipmentTier, isEquipmentItem, itemsFromTier } from './equipment';

describe('equipment picker', () => {
  it('bodyweight is exclusive both ways', () => {
    expect(toggleEquipment(['dumbbells', 'bench'], 'bodyweight')).toEqual(['bodyweight']);
    expect(toggleEquipment(['bodyweight'], 'kettlebells')).toEqual(['kettlebells']);
    expect(toggleEquipment(['bodyweight'], 'bodyweight')).toEqual([]);
  });
  it('folds items to the tier the matcher expects', () => {
    expect(equipmentTier([])).toBeNull();
    expect(equipmentTier(['bodyweight'])).toBe('minimal');
    expect(equipmentTier(['kettlebells', 'pull-up-bar'])).toBe('home');
    expect(equipmentTier(['dumbbells', 'bench', 'bands'])).toBe('home');
    expect(equipmentTier(['dumbbells', 'barbell'])).toBe('full-gym');
    expect(equipmentTier(['machines'])).toBe('full-gym');
  });
  it('validates ids and maps legacy tiers', () => {
    expect(isEquipmentItem('cable')).toBe(true);
    expect(isEquipmentItem('treadmill')).toBe(false);
    expect(itemsFromTier('minimal')).toEqual(['bodyweight']);
    expect(itemsFromTier(undefined)).toEqual([]);
  });
});
