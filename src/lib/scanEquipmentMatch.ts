// Scan & Go: does an exercise's "equipmentUsed" refer to something in the
// detected-equipment list? The model rarely repeats a name letter for letter
// ("Plate-loaded shoulder press" in the list, "Shoulder press machine" on the
// exercise), and a strict comparison silently threw those exercises away.

const FILLER = new Set(['machine', 'machines', 'plate', 'loaded', 'selectorized', 'station', 'the', 'a', 'an', 'with', 'and', 'for', 'of', 'style', 'type', 'unit', 'equipment']);

export const normEquipment = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const tokens = (v: string) => normEquipment(v).split(' ').filter((t) => t && !FILLER.has(t)).map((t) => t.replace(/s$/, ''));

export function matchesDetectedEquipment(equipmentUsed: string | undefined, detected: string[]): boolean {
  const n = normEquipment(equipmentUsed ?? 'bodyweight');
  if (!n || n === 'bodyweight' || n === 'body weight' || n === 'none') return true;
  const used = tokens(n);
  if (used.length === 0) return false;
  return detected.some((name) => {
    const a = normEquipment(name);
    if (a === n || a.includes(n) || n.includes(a)) return true;
    const have = tokens(a);
    if (have.length === 0) return false;
    // Every meaningful word of the shorter name appears in the longer one:
    // "shoulder press" vs "plate loaded shoulder press machine".
    const [short, long] = used.length <= have.length ? [used, have] : [have, used];
    return short.every((t) => long.includes(t));
  });
}
