/**
 * The weekly coach report. The numbers are worked out here from what the
 * member logged (pure, unit-tested); the AI only writes the coaching words
 * around them, and there is a rule-based fallback when it is unavailable.
 * One report per member per week, stored at weeklyReports/{uid}_{week}.
 */

export interface WeekStats {
  week: string;                 // Monday, YYYY-MM-DD
  workouts: number; prevWorkouts: number;
  sets: number; minutes: number;
  volumeKg: number; prevVolumeKg: number;
  plannedPerWeek: number | null;
  mealDays: number; avgKcal: number | null; avgProtein: number | null; avgCarbs?: number | null; avgFat?: number | null;
  kcalGoal: number | null; proteinGoal: number | null;
  weightStartKg: number | null; weightEndKg: number | null;
  avgSleepMin: number | null; avgSteps: number | null; avgRestingHr: number | null;
  streak: number;
  programName: string | null; programPct: number | null;
}

export interface WeeklyReport {
  week: string;
  headline: string;
  wins: string[];
  fix: string;
  targets: string[];
  stats: WeekStats;
  generatedBy: 'ai' | 'rules';
}

const DAY = 86_400_000;

/**
 * The Monday of the week the report covers: always the last complete
 * Monday-Sunday week, so a report never misses a Sunday session. Ready
 * from Monday, when the weekly push goes out.
 */
export function reportWeek(todayKey: string): string {
  const d = new Date(`${todayKey}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sunday
  const back = (dow === 0 ? 6 : dow - 1) + 7;
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

export interface RawEvent { type: string; at: number; payload: Record<string, unknown> }
export interface RawHealthDay { date: string; sleepMinutes?: number; steps?: number; restingHeartRate?: number; weightKg?: number }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

export function computeWeekStats(
  week: string,
  events: RawEvent[],
  healthDays: RawHealthDay[],
  profile: { goals?: { calories?: number; protein?: number }; streak?: number; programName?: string | null; programPct?: number | null; plannedPerWeek?: number | null },
): WeekStats {
  const start = new Date(`${week}T00:00:00Z`).getTime(), end = start + 7 * DAY, prevStart = start - 7 * DAY;
  const inWeek = (e: RawEvent) => e.at >= start && e.at < end;
  const workouts = events.filter((e) => e.type === 'WORKOUT_COMPLETED' && inWeek(e));
  const prev = events.filter((e) => e.type === 'WORKOUT_COMPLETED' && e.at >= prevStart && e.at < start);
  const sets = workouts.reduce((n, e) => n + ((e.payload.exercises as { sets?: { completed?: boolean }[] }[] | undefined) ?? [])
    .reduce((m, ex) => m + (ex.sets ?? []).filter((s) => s.completed).length, 0), 0);

  const meals = events.filter((e) => e.type === 'MEAL_LOGGED' && inWeek(e));
  const byDay = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
  for (const m of meals) {
    const k = new Date(m.at).toISOString().slice(0, 10);
    const t = byDay.get(k) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    t.kcal += Number(m.payload.calories) || 0; t.protein += Number(m.payload.protein) || 0;
    t.carbs += Number(m.payload.carbs) || 0; t.fat += Number(m.payload.fat) || 0;
    byDay.set(k, t);
  }
  const days = [...byDay.values()].filter((d) => d.kcal > 0);

  const weights = [
    ...events.filter((e) => e.type === 'WEIGHT_RECORDED' && inWeek(e)).map((e) => ({ at: e.at, kg: Number(e.payload.weightKg) })),
    ...healthDays.filter((h) => h.weightKg && h.date >= week && h.date < new Date(end).toISOString().slice(0, 10))
      .map((h) => ({ at: new Date(`${h.date}T12:00:00Z`).getTime(), kg: h.weightKg as number })),
  ].filter((w) => w.kg > 0).sort((a, b) => a.at - b.at);

  const hd = healthDays.filter((h) => h.date >= week && h.date < new Date(end).toISOString().slice(0, 10));
  const num = (xs: (number | undefined)[]) => xs.filter((x): x is number => typeof x === 'number' && x > 0);

  return {
    week,
    workouts: workouts.length, prevWorkouts: prev.length,
    sets, minutes: Math.round(workouts.reduce((n, e) => n + (Number(e.payload.duration) || 0), 0)),
    volumeKg: Math.round(workouts.reduce((n, e) => n + (Number(e.payload.totalWeightLifted) || 0), 0)),
    prevVolumeKg: Math.round(prev.reduce((n, e) => n + (Number(e.payload.totalWeightLifted) || 0), 0)),
    plannedPerWeek: profile.plannedPerWeek ?? null,
    mealDays: days.length,
    avgKcal: days.length ? Math.round(avg(days.map((d) => d.kcal))!) : null,
    avgProtein: days.length ? Math.round(avg(days.map((d) => d.protein))!) : null,
    avgCarbs: days.length ? Math.round(avg(days.map((d) => d.carbs))!) : null,
    avgFat: days.length ? Math.round(avg(days.map((d) => d.fat))!) : null,
    kcalGoal: profile.goals?.calories || null, proteinGoal: profile.goals?.protein || null,
    weightStartKg: weights.length ? r1(weights[0].kg) : null,
    weightEndKg: weights.length > 1 ? r1(weights[weights.length - 1].kg) : null,
    avgSleepMin: r1(avg(num(hd.map((h) => h.sleepMinutes)))) != null ? Math.round(avg(num(hd.map((h) => h.sleepMinutes)))!) : null,
    avgSteps: num(hd.map((h) => h.steps)).length ? Math.round(avg(num(hd.map((h) => h.steps)))!) : null,
    avgRestingHr: num(hd.map((h) => h.restingHeartRate)).length ? Math.round(avg(num(hd.map((h) => h.restingHeartRate)))!) : null,
    streak: profile.streak ?? 0,
    programName: profile.programName ?? null, programPct: profile.programPct ?? null,
  };
}

/** True when there is nothing to report on. */
/** Bumped when the report's content or rules change, so stored reports from the old version are rebuilt once. */
export const REPORT_VERSION = 3;

export const quietWeek = (s: WeekStats) => s.workouts === 0 && s.mealDays === 0 && s.weightStartKg == null && s.avgSleepMin == null && s.avgSteps == null;

const h = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

/** Used when the AI is off or fails. Plain, factual, still useful. */
export function rulesReport(s: WeekStats): Omit<WeeklyReport, 'stats' | 'generatedBy' | 'week'> {
  const wins: string[] = [];
  const planned = s.plannedPerWeek || 3;
  if (s.workouts > 0) wins.push(`${s.workouts} workout${s.workouts === 1 ? '' : 's'} done, ${s.sets} sets in ${s.minutes} minutes.`);
  if (s.workouts > s.prevWorkouts && s.prevWorkouts > 0) wins.push(`More sessions than the week before (${s.prevWorkouts} → ${s.workouts}).`);
  if (s.volumeKg > s.prevVolumeKg && s.prevVolumeKg > 0) wins.push(`Total weight lifted up ${Math.round(((s.volumeKg - s.prevVolumeKg) / s.prevVolumeKg) * 100)}%.`);
  if (s.mealDays >= 5) wins.push(`Food logged on ${s.mealDays} of 7 days.`);
  if (s.streak >= 3) wins.push(`${s.streak}-day streak.`);
  if (!wins.length) wins.push('You opened the app and showed up. That is where it starts.');

  let fix = '';
  if (s.workouts < planned) fix = `You trained ${s.workouts} of ${planned} planned days. Put your sessions in your calendar like appointments.`;
  else if (s.proteinGoal && s.avgProtein != null && s.avgProtein < s.proteinGoal * 0.8) fix = `Protein averaged ${s.avgProtein} g against a ${s.proteinGoal} g target. Add one protein-rich meal or a shake a day.`;
  else if (s.avgSleepMin != null && s.avgSleepMin < 420) fix = `Sleep averaged ${h(s.avgSleepMin)}. Aim for 7 hours: it drives recovery and strength.`;
  else if (s.mealDays < 4) fix = `Food was logged on ${s.mealDays} days. Log at least 5 days so your targets can be tuned.`;
  else fix = 'Keep the same routine and add a little weight or one rep where the app suggests it.';

  const targets = [
    `${Math.max(planned, s.workouts)} workouts`,
    s.proteinGoal ? `${s.proteinGoal} g protein a day` : 'Log food 5 days',
    s.avgSleepMin != null ? '7h+ sleep a night' : (s.avgSteps != null ? `${Math.max(8000, Math.round((s.avgSteps + 1000) / 500) * 500).toLocaleString()} steps a day` : 'One more set than last week on your main lift'),
  ];
  const headline = s.workouts >= planned ? 'Strong week. Keep the momentum.' : s.workouts > 0 ? 'Good start. Let’s get every session in this week.' : 'New week, clean slate.';
  return { headline, wins: wins.slice(0, 3), fix, targets };
}

export const REPORT_SYSTEM_PROMPT = `You are the member's strength coach in the Warfare Fitness app. Write their weekly review from the JSON stats they send.
Rules: use ONLY the numbers given, never invent data. Be direct, warm, specific, no hype, no emojis, no medical claims. Weights are in kg in the data; say "kg".
A win must be genuinely good: never praise a low or below-target number (1 day of food logging, calories far under goal, 0 kg lifted, fewer workouts than planned). If only one real win exists, return one. Averages for calories and macros are over the days food was logged (mealDays), so with few mealDays say the picture is incomplete rather than judging intake. volumeKg 0 means bodyweight or cardio work, not zero effort.
Return JSON: {"headline": string (max 9 words), "wins": string[] (1-3 items, each max 20 words, concrete from the stats), "fix": string (ONE thing to change this week, max 30 words, practical), "targets": string[] (exactly 3 short measurable targets for next week, max 8 words each)}.`;

/** Accepts the model's JSON only if it has the right shape and sane lengths. */
export function parseReport(raw: string): Omit<WeeklyReport, 'stats' | 'generatedBy' | 'week'> | null {
  try {
    const j = JSON.parse(raw) as { headline?: unknown; wins?: unknown; fix?: unknown; targets?: unknown };
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
    const headline = str(j.headline, 90), fix = str(j.fix, 260);
    const wins = Array.isArray(j.wins) ? j.wins.map((w) => str(w, 200)).filter((w): w is string => !!w).slice(0, 3) : [];
    const targets = Array.isArray(j.targets) ? j.targets.map((t) => str(t, 80)).filter((t): t is string => !!t).slice(0, 3) : [];
    if (!headline || !fix || !wins.length || targets.length < 2) return null;
    return { headline, wins, fix, targets };
  } catch { return null; }
}

/**
 * Week score for the coach report: each area 0-100 from the week's own
 * numbers, and the overall score as their average. An area with no data
 * is left out rather than counted as zero.
 */
export interface ScoreAxis { key: string; label: string; score: number }
export function weekScore(s: WeekStats): { score: number | null; axes: ScoreAxis[] } {
  const axes: ScoreAxis[] = [];
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const planned = s.plannedPerWeek || 3;
  axes.push({ key: 'training', label: 'Training', score: clamp((s.workouts / planned) * 100) });
  if (s.mealDays) axes.push({ key: 'logging', label: 'Food log', score: clamp((s.mealDays / 7) * 100) });
  if (s.avgKcal != null && s.kcalGoal && s.mealDays >= 3) axes.push({ key: 'calories', label: 'Calories', score: clamp(100 - (Math.abs(s.avgKcal - s.kcalGoal) / s.kcalGoal) * 200) });
  if (s.avgProtein != null && s.proteinGoal && s.mealDays >= 3) axes.push({ key: 'protein', label: 'Protein', score: clamp((s.avgProtein / s.proteinGoal) * 100) });
  if (s.avgSleepMin != null) axes.push({ key: 'sleep', label: 'Sleep', score: clamp((s.avgSleepMin / 450) * 100) });
  if (s.avgSteps != null) axes.push({ key: 'steps', label: 'Steps', score: clamp((s.avgSteps / 10000) * 100) });
  const score = axes.length ? Math.round(axes.reduce((a, x) => a + x.score, 0) / axes.length) : null;
  return { score, axes };
}
