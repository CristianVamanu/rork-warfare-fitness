/**
 * Turns the stored per-day wearable summaries (healthDays) into what the
 * app's watch panels show: a personal baseline, "vs your usual" deltas, a
 * readiness score and a one-line brief. Pure functions, no I/O.
 *
 * The readiness score is our own guide built from two signals the phone
 * really gives us (sleep minutes and resting heart rate) compared with the
 * person's own recent average. It is not a medical measure and the UI says so.
 */
import type { HealthDaySummary } from '@/lib/native/health';

export type DayMap = Map<string, HealthDaySummary>;

/** YYYY-MM-DD in local time. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The last `n` local dates, oldest first, ending today. */
export function lastDays(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

type NumKey = 'steps' | 'sleepMinutes' | 'restingHeartRate' | 'avgHeartRate' | 'activeKcal' | 'weightKg' | 'minHeartRate' | 'hrvMs' | 'totalKcal' | 'deepMinutes' | 'remMinutes' | 'lightMinutes' | 'awakeMinutes';

/** Values for one metric across the given dates; null where the day has none. */
export function series(days: DayMap, dates: string[], key: NumKey): (number | null)[] {
  return dates.map(d => {
    const v = days.get(d)?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

/** Mean of the non-null values, or null if fewer than `min` exist. */
export function mean(values: (number | null)[], min = 1): number | null {
  const v = values.filter((x): x is number => x != null);
  if (v.length < min) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Days needed in the baseline window before deltas and readiness show. */
export const MIN_BASELINE_DAYS = 4;

export interface Readiness {
  /** 0-100, or null while the baseline is still being built. */
  score: number | null;
  /** Today's sleep minus the usual, minutes. */
  sleepDelta: number | null;
  /** Today's resting HR minus the usual, bpm. */
  rhrDelta: number | null;
  /** Which heart-rate signal was used: real resting HR, or the day's lowest HR when the watch writes none. */
  hrSource: 'resting' | 'lowest' | null;
  /** Today's HRV vs the usual, percent. */
  hrvDeltaPct: number | null;
  /** How many earlier days carry sleep or resting HR (for "building baseline"). */
  baselineDays: number;
  level: 'high' | 'normal' | 'low' | 'unknown';
}

/**
 * Baseline = the 14 days before today. Today is excluded so a bad night
 * can't pull its own average down.
 */
export function readiness(days: DayMap, now = new Date()): Readiness {
  const dates = lastDays(15, now);
  const today = days.get(dates[dates.length - 1]);
  const prior = dates.slice(0, -1);
  const sleepBase = mean(series(days, prior, 'sleepMinutes'), MIN_BASELINE_DAYS);
  // Resting HR when the watch writes it; otherwise the day's lowest HR,
  // which moves the same way with fatigue. Never mixed within one window.
  const hrKey: NumKey = dates.some(d => days.get(d)?.restingHeartRate != null) ? 'restingHeartRate' : 'minHeartRate';
  const hrSource = dates.some(d => days.get(d)?.[hrKey] != null) ? (hrKey === 'restingHeartRate' ? 'resting' : 'lowest') : null;
  const rhrBase = mean(series(days, prior, hrKey), MIN_BASELINE_DAYS);
  const hrvBase = mean(series(days, prior, 'hrvMs'), MIN_BASELINE_DAYS);
  const baselineDays = prior.filter(d => days.get(d)?.sleepMinutes != null || days.get(d)?.[hrKey] != null).length;

  const sleep = today?.sleepMinutes ?? null;
  const rhr = (today?.[hrKey] as number | undefined) ?? null;
  const hrv = today?.hrvMs ?? null;
  const hrvDeltaPct = hrv != null && hrvBase ? Math.round(((hrv - hrvBase) / hrvBase) * 100) : null;
  const sleepDelta = sleep != null && sleepBase != null ? Math.round(sleep - sleepBase) : null;
  const rhrDelta = rhr != null && rhrBase != null ? Math.round(rhr - rhrBase) : null;

  if (sleepDelta == null && rhrDelta == null && hrvDeltaPct == null) return { score: null, sleepDelta, rhrDelta, hrSource, hrvDeltaPct, baselineDays, level: 'unknown' };

  let score = 75;
  if (sleepDelta != null && sleepBase) {
    // Every 10% of the usual night missed or gained moves the score 6 points, capped.
    score += Math.max(-25, Math.min(12, (sleepDelta / sleepBase) * 60));
    if (sleep != null && sleep < 6 * 60) score -= 8;
  }
  if (rhrDelta != null) {
    // A raised resting HR is the stronger warning sign than a lowered one is good news.
    score += rhrDelta > 0 ? -Math.min(25, rhrDelta * 4) : Math.min(8, -rhrDelta * 2);
  }
  if (hrvDeltaPct != null) {
    // HRV well below your usual is a fatigue sign; above it, a small plus.
    score += hrvDeltaPct < 0 ? Math.max(-18, hrvDeltaPct * 0.6) : Math.min(6, hrvDeltaPct * 0.3);
  }
  const s = Math.round(Math.max(0, Math.min(100, score)));
  return { score: s, sleepDelta, rhrDelta, hrSource, hrvDeltaPct, baselineDays, level: s >= 80 ? 'high' : s >= 60 ? 'normal' : 'low' };
}

/** "1h 30m" / "45m" for a minute count, sign dropped. */
export function fmtMinutes(m: number): string {
  const a = Math.abs(Math.round(m));
  const h = Math.floor(a / 60), r = a % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}

/** The one-line brief under the readiness ring. Plain rules, no AI call. */
export function brief(r: Readiness): string {
  if (r.score == null) {
    return r.baselineDays < MIN_BASELINE_DAYS
      ? `Learning your normal: ${r.baselineDays} of ${MIN_BASELINE_DAYS} nights so far. Wear your watch to bed.`
      : 'No sleep or resting heart rate from your watch today yet.';
  }
  const parts: string[] = [];
  if (r.sleepDelta != null && Math.abs(r.sleepDelta) >= 20) parts.push(`sleep ${fmtMinutes(r.sleepDelta)} ${r.sleepDelta < 0 ? 'under' : 'over'} your usual`);
  if (r.rhrDelta != null && Math.abs(r.rhrDelta) >= 3) parts.push(`${r.hrSource === 'lowest' ? 'lowest HR' : 'resting HR'} ${r.rhrDelta > 0 ? '+' : '−'}${Math.abs(r.rhrDelta)} bpm`);
  if (r.hrvDeltaPct != null && Math.abs(r.hrvDeltaPct) >= 10) parts.push(`HRV ${r.hrvDeltaPct > 0 ? '+' : '−'}${Math.abs(r.hrvDeltaPct)}%`);
  const what = parts.length ? parts.join(' and ') : 'your recovery signals are close to your usual';
  const cap = what.charAt(0).toUpperCase() + what.slice(1);
  if (r.level === 'low') return `${cap}. Consider an easier session today: fewer sets or lighter weights.`;
  if (r.level === 'high') return `${cap}. Good day to push.`;
  return `${cap}. Train as planned.`;
}
