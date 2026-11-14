/**
 * Android (Health Connect) does not read heart data any more: heart rate,
 * resting heart rate and HRV were removed from the app's permissions. Days
 * synced by older Android builds can still hold those fields, so every read
 * drops them and every Android sync deletes them from the stored day.
 */
export const HEART_FIELDS = ['avgHeartRate', 'restingHeartRate', 'minHeartRate', 'hrvMs'] as const;

export function dropAndroidHeart<T extends object>(day: T): T {
  if ((day as { source?: unknown }).source !== 'healthconnect') return day;
  const copy = { ...day } as Record<string, unknown>;
  for (const f of HEART_FIELDS) delete copy[f];
  return copy as T;
}
