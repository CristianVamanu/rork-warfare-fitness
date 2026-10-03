export type DistanceUnit = 'mi' | 'km' | 'm';

/**
 * Pulls a distance target straight out of an exercise's `reps` field (e.g.
 * "500m", "5km", "1 mile") so the training session can swap the plain
 * duration timer for a stopwatch + pace tracker. Shared between the session
 * player (which reads it) and the program builder (which writes it) so both
 * agree on exactly what counts as a valid distance string.
 */
export function parseDistance(reps: number | string): { value: number; unit: DistanceUnit } | null {
  const str = String(reps).toLowerCase();
  const match = str.match(/([\d.]+)\s*(miles|mile|mi|kilometers|kilometer|km|meters|meter|metres|metre|m|k)\b/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;
  const unitStr = match[2];
  let unit: DistanceUnit;
  if (unitStr.startsWith('mi')) unit = 'mi';
  else if (unitStr === 'm' || unitStr.startsWith('meter') || unitStr.startsWith('metre')) unit = 'm';
  else unit = 'km'; // km, kilometer(s), or bare "k"
  return { value, unit };
}
