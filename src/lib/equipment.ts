import type { EquipmentType } from '@/types';

/**
 * The equipment a member actually owns, as ten tickable items, and how
 * that folds down to the three tiers the program matcher was tuned on.
 *
 * The matcher keeps taking the tier: it is tested, and the programs are
 * tagged by tier, so nothing about which program someone is handed
 * changes. What changes is that the app now knows the items, which is
 * what "you need a barbell for this" and exercise swaps are built on.
 * Pure. Tested without a browser.
 */

export const EQUIPMENT_ITEMS = [
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell & plates' },
  { id: 'squat-rack', label: 'Squat rack' },
  { id: 'bench', label: 'Bench' },
  { id: 'cable', label: 'Cable machine' },
  { id: 'machines', label: 'Gym machines' },
  { id: 'pull-up-bar', label: 'Pull-up bar' },
  { id: 'kettlebells', label: 'Kettlebells' },
  { id: 'bands', label: 'Resistance bands' },
  { id: 'bodyweight', label: 'Bodyweight only' },
] as const;

export type EquipmentItem = typeof EQUIPMENT_ITEMS[number]['id'];

const IDS = new Set<string>(EQUIPMENT_ITEMS.map((i) => i.id));
export const isEquipmentItem = (v: unknown): v is EquipmentItem => typeof v === 'string' && IDS.has(v);

/** Items that mean "a gym" for matching purposes. */
const GYM: ReadonlySet<EquipmentItem> = new Set(['barbell', 'squat-rack', 'cable', 'machines']);

/**
 * Tick or untick one item. "Bodyweight only" is exclusive both ways: it
 * clears everything else, and any other tick clears it.
 */
export function toggleEquipment(current: readonly EquipmentItem[], item: EquipmentItem): EquipmentItem[] {
  if (current.includes(item)) return current.filter((x) => x !== item);
  if (item === 'bodyweight') return ['bodyweight'];
  return [...current.filter((x) => x !== 'bodyweight'), item];
}

/** The matcher's tier for a set of items; null when nothing is ticked. */
export function equipmentTier(items: readonly EquipmentItem[]): EquipmentType | null {
  if (items.length === 0) return null;
  if (items.some((i) => GYM.has(i))) return 'full-gym';
  if (items.some((i) => i !== 'bodyweight')) return 'home';
  return 'minimal';
}

/** The items a legacy tier implies, for members who answered before the
 *  picker existed. Kept deliberately small: it is a guess, and an empty
 *  list ("unknown") is more honest than a confident wrong one. */
export function itemsFromTier(tier: EquipmentType | null | undefined): EquipmentItem[] {
  if (tier === 'full-gym') return ['dumbbells', 'barbell', 'squat-rack', 'bench', 'cable', 'machines', 'pull-up-bar'];
  if (tier === 'home') return ['dumbbells'];
  if (tier === 'minimal') return ['bodyweight'];
  return [];
}

export function equipmentLabel(id: EquipmentItem): string {
  return EQUIPMENT_ITEMS.find((i) => i.id === id)?.label ?? id;
}
