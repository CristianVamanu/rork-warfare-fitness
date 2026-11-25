/**
 * Fasting: plans, the stages shown around the timer, the plan suggested from
 * someone's usual meal times, and the weekly history. Pure, so it is tested.
 *
 * Stage timings are typical figures, not measurements of this person. The
 * copy says "typically" for that reason.
 */

export interface FastingPlan { id: string; fast: number; eat: number; note: string }
export const FASTING_PLANS: FastingPlan[] = [
  { id: '12:12', fast: 12, eat: 12, note: 'Gentle start' },
  { id: '14:10', fast: 14, eat: 10, note: 'Easy step up' },
  { id: '16:8', fast: 16, eat: 8, note: 'Most popular' },
  { id: '18:6', fast: 18, eat: 6, note: 'Experienced' },
  { id: '20:4', fast: 20, eat: 4, note: 'Advanced' },
  { id: 'OMAD', fast: 23, eat: 1, note: 'One meal a day' },
];
export const planById = (id?: string | null) => FASTING_PLANS.find((p) => p.id === id) ?? FASTING_PLANS[2];

export interface FastingStage { id: string; from: number; title: string; body: string }
export const FASTING_STAGES: FastingStage[] = [
  { id: 'fed', from: 0, title: 'Digesting', body: 'Your body is working through your last meal. Blood sugar and insulin are typically at their highest here.' },
  { id: 'settle', from: 4, title: 'Blood sugar settles', body: 'Digestion winds down and insulin typically falls. Your body starts leaning on stored carbohydrate.' },
  { id: 'burn', from: 12, title: 'Fat burning', body: 'With stored carbohydrate running low, the body typically shifts toward burning fat for fuel.' },
  { id: 'ketosis', from: 18, title: 'Ketones rise', body: 'Fat is being turned into ketones, a second fuel. Many people report steadier energy here.' },
  { id: 'repair', from: 24, title: 'Deep fast', body: 'A long fast. Research on cell clean-up at this point is mostly from animal studies. Listen to your body.' },
];
export function stageAt(hours: number): FastingStage {
  return [...FASTING_STAGES].reverse().find((s) => hours >= s.from) ?? FASTING_STAGES[0];
}

/** "08:30" -> 510. */
export const toMinutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const toHHMM = (min: number): string => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/**
 * A plan one step beyond what they already do. Someone who eats 08:00 to
 * 21:00 already fasts 11 hours overnight, so 14:10 is a real but reachable
 * step. Never suggests more than 16:8 to a beginner.
 */
export function suggestPlan(firstMeal: string, lastMeal: string): FastingPlan {
  let window = toMinutes(lastMeal) - toMinutes(firstMeal);
  if (window <= 0) window += 1440;
  const natural = (1440 - window) / 60;
  const target = Math.min(16, Math.max(12, natural + 2));
  return FASTING_PLANS.find((p) => p.fast >= target) ?? FASTING_PLANS[2];
}

export interface FastLogEntry { start: number; end: number; goalHours: number }
const MIN_LOGGED_MS = 30 * 60 * 1000;
/** Newest first, capped, and a fast stopped within half an hour is not history. */
export function addToLog(log: FastLogEntry[] | undefined, e: FastLogEntry, cap = 90): FastLogEntry[] {
  if (e.end - e.start < MIN_LOGGED_MS) return log ?? [];
  return [e, ...(log ?? [])].slice(0, cap);
}

/** Monday 00:00 local of the week containing `d`, shifted by `offset` weeks. */
export function weekStart(d: Date, offset = 0): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + offset * 7);
  return x;
}

/** Hours fasted per day (Mon..Sun), credited to the day the fast ended. */
export function weekBars(log: FastLogEntry[] | undefined, start: Date): { hours: number[]; average: number } {
  const hours = Array(7).fill(0) as number[];
  const s = start.getTime();
  for (const e of log ?? []) {
    const i = Math.floor((e.end - s) / 86_400_000);
    if (i >= 0 && i < 7) hours[i] = Math.max(hours[i], (e.end - e.start) / 3_600_000);
  }
  const done = hours.filter((h) => h > 0);
  return { hours, average: done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0 };
}

export function formatHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
export function formatHM(hours: number): string {
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
