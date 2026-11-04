/**
 * Adaptive calories: the member's real maintenance, from what they ate and
 * how their weight actually moved, instead of a formula guess.
 *
 *   maintenance ≈ average intake − (weight trend in kg/day × 7700)
 *
 * 7,700 kcal per kg of body weight change is the standard working figure.
 * Needs enough data to mean anything: 10+ days with a realistic food log
 * (800+ kcal, so half-logged days do not drag the average down) and 3+
 * weigh-ins spread over 10+ days, inside the last 28 days. The weight
 * trend is a least-squares line, so one heavy morning does not swing it.
 * Pure, unit-tested.
 */
import type { FitnessGoal } from '@/types';

export interface Intake { at: number; kcal: number }
export interface WeighIn { at: number; kg: number }

export interface AdaptiveResult {
  maintenance: number;
  target: number;
  loggedDays: number;
  weighIns: number;
  kgPerWeek: number;
}

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function estimateAdaptive(meals: Intake[], weights: WeighIn[], goal: FitnessGoal | undefined, now = Date.now()): AdaptiveResult | { needs: string } {
  const since = now - 28 * DAY;
  const perDay = new Map<string, number>();
  for (const m of meals) if (m.at >= since && m.kcal > 0) perDay.set(dayKey(m.at), (perDay.get(dayKey(m.at)) ?? 0) + m.kcal);
  const days = [...perDay.values()].filter((k) => k >= 800);
  const w = weights.filter((x) => x.at >= since && x.kg > 0).sort((a, b) => a.at - b.at);
  const spanDays = w.length ? (w[w.length - 1].at - w[0].at) / DAY : 0;

  if (days.length < 10 || w.length < 3 || spanDays < 10) {
    const parts: string[] = [];
    if (days.length < 10) parts.push(`${10 - days.length} more days of food logging`);
    if (w.length < 3) parts.push(`${3 - w.length} more weigh-in${3 - w.length === 1 ? '' : 's'}`);
    else if (spanDays < 10) parts.push('weigh-ins spread over at least 10 days');
    return { needs: parts.join(' and ') };
  }

  const avgIntake = days.reduce((a, b) => a + b, 0) / days.length;
  // Least-squares slope of weight over time, kg per day.
  const xs = w.map((p) => (p.at - w[0].at) / DAY), ys = w.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0), den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;

  const maintenance = Math.round((avgIntake - slope * 7700) / 10) * 10;
  let target = maintenance;
  if (goal === 'lose-fat') target = maintenance - Math.min(750, Math.round(maintenance * 0.2));
  else if (goal === 'build-muscle') target = maintenance + 250;
  else if (goal === 'recomposition') target = maintenance - 200;
  target = Math.max(1200, Math.round(target / 10) * 10);
  return { maintenance, target, loggedDays: days.length, weighIns: w.length, kgPerWeek: Math.round(slope * 7 * 100) / 100 };
}
