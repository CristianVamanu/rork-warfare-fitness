/**
 * Training minutes per day from BOTH sources, each session counted once.
 *
 * - Watch workouts (Health Connect / Apple Health): start time + length.
 * - Sessions finished in the app: finish time + length (minutes).
 *
 * Every session becomes a time interval and the day's total is the length of
 * the UNION of those intervals, so a session recorded by the watch and logged
 * in the app at the same time counts once, while separate sessions add up.
 * An interval crossing midnight is split between the two days.
 *
 * Watch workouts synced before start times were stored have no position on
 * the clock; for those days the total is the larger of the two sources rather
 * than their sum, so nothing is ever double-counted. Pure; unit-tested.
 */
import type { DayMap } from './healthTrends';

export interface AppSession { end: Date; minutes: number }
type Iv = [number, number];

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayStart = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

function unionMinutes(ivs: Iv[]): number {
  if (!ivs.length) return 0;
  const s = [...ivs].sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = s[0];
  for (const [a, b] of s.slice(1)) {
    if (a <= ce) ce = Math.max(ce, b);
    else { total += ce - cs; cs = a; ce = b; }
  }
  total += ce - cs;
  return total / 60000;
}

/** Clip an interval to one calendar day. */
function clip(iv: Iv, key: string): Iv | null {
  const ds = dayStart(key), de = ds + 86_400_000;
  const a = Math.max(iv[0], ds), b = Math.min(iv[1], de);
  return b > a ? [a, b] : null;
}

export function trainingMinutesByDay(dates: string[], days: DayMap, app: AppSession[]): Map<string, number> {
  const out = new Map<string, number>();
  const appIvs: Iv[] = app
    .filter((s) => s.minutes > 0 && s.end instanceof Date && !isNaN(s.end.getTime()))
    .map((s) => [s.end.getTime() - s.minutes * 60000, s.end.getTime()]);
  for (const key of dates) {
    const timed: Iv[] = [];
    let untimed = 0;
    for (const w of days.get(key)?.workouts ?? []) {
      const t = w.start ? Date.parse(w.start) : NaN;
      if (!isNaN(t) && w.minutes > 0) timed.push([t, t + w.minutes * 60000]);
      else untimed += w.minutes ?? 0;
    }
    const all = [...timed, ...appIvs].map((iv) => clip(iv, key)).filter((iv): iv is Iv => !!iv);
    const union = unionMinutes(all);
    out.set(key, Math.round(untimed > 0 ? Math.max(union, untimed + unionMinutes(timed.map((iv) => clip(iv, key)).filter((iv): iv is Iv => !!iv))) : union));
  }
  return out;
}

export { keyOf as trainingDayKey };
