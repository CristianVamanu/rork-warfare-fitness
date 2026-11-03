/**
 * Retention maths for Admin → Retention. Pure: the API route loads members
 * and their events, this turns them into the numbers. Unit-tested.
 *
 * Definitions (shown on the panel too):
 *  - Active on a day      = logged anything (workout, meal, water, weight…).
 *  - Day 1 retention      = active on day 1 or 2 after signing up.
 *  - Day 7 retention      = active on any day 7-13.
 *  - Day 30 retention     = active on any day 30-44.
 *  - First workout        = finished at least one workout within 7 days.
 *  - First week           = finished 3+ workouts within 7 days.
 *  - Paid                 = has a Stripe subscription now (admin grants excluded).
 * A cohort only counts toward a measure once it is old enough to have
 * reached it; younger members are left out of that percentage.
 */
const DAY = 86_400_000;

export interface Member { uid: string; signedUpAt: number; paid: boolean; programId?: string; programName?: string; completedWorkouts?: number; totalWorkouts?: number }
export interface Activity { uid: string; at: number; type: string }

export interface Rate { n: number; of: number; pct: number | null }
const rate = (n: number, of: number): Rate => ({ n, of, pct: of ? Math.round((n / of) * 1000) / 10 : null });

export interface Cohort {
  week: string; // Monday, YYYY-MM-DD
  signups: number;
  d1: Rate; d7: Rate; d30: Rate;
  firstWorkout: Rate; firstWeek: Rate; paid: Rate;
}

export interface RetentionReport {
  generatedAt: number;
  totals: { members: number; dau: number; wau: number; mau: number };
  overall: { d1: Rate; d7: Rate; d30: Rate; firstWorkout: Rate; firstWeek: Rate; paid: Rate };
  cohorts: Cohort[];
  programs: { programId: string; name: string; enrolled: number; avgPct: number; finishedHalf: Rate; stalled: number }[];
}

const mondayKey = (t: number) => {
  const d = new Date(t);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return m.toISOString().slice(0, 10);
};

export function buildReport(members: Member[], activity: Activity[], now = Date.now(), weeks = 8): RetentionReport {
  const byUser = new Map<string, Activity[]>();
  for (const a of activity) (byUser.get(a.uid) ?? byUser.set(a.uid, []).get(a.uid)!).push(a);

  const activeIn = (m: Member, fromDay: number, toDay: number) =>
    (byUser.get(m.uid) ?? []).some((a) => a.at >= m.signedUpAt + fromDay * DAY && a.at < m.signedUpAt + (toDay + 1) * DAY);
  const workoutsIn = (m: Member, days: number) =>
    (byUser.get(m.uid) ?? []).filter((a) => a.type === 'WORKOUT_COMPLETED' && a.at < m.signedUpAt + days * DAY).length;
  const age = (m: Member) => (now - m.signedUpAt) / DAY;

  const measure = (list: Member[]) => {
    const eligible = (minAge: number) => list.filter((m) => age(m) >= minAge);
    const e2 = eligible(3), e13 = eligible(14), e44 = eligible(45), e7 = eligible(7);
    return {
      d1: rate(e2.filter((m) => activeIn(m, 1, 2)).length, e2.length),
      d7: rate(e13.filter((m) => activeIn(m, 7, 13)).length, e13.length),
      d30: rate(e44.filter((m) => activeIn(m, 30, 44)).length, e44.length),
      firstWorkout: rate(e7.filter((m) => workoutsIn(m, 7) >= 1).length, e7.length),
      firstWeek: rate(e7.filter((m) => workoutsIn(m, 7) >= 3).length, e7.length),
      paid: rate(list.filter((m) => m.paid).length, list.length),
    };
  };

  const recent = members.filter((m) => m.signedUpAt >= now - weeks * 7 * DAY);
  const groups = new Map<string, Member[]>();
  for (const m of recent) (groups.get(mondayKey(m.signedUpAt)) ?? groups.set(mondayKey(m.signedUpAt), []).get(mondayKey(m.signedUpAt))!).push(m);
  const cohorts = [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, list]) => ({ week, signups: list.length, ...measure(list) }));

  const activeSince = (ms: number) => new Set(activity.filter((a) => a.at >= now - ms).map((a) => a.uid)).size;

  const progs = new Map<string, { name: string; pcts: number[]; half: number; stalled: number }>();
  const lastActive = new Map<string, number>();
  for (const a of activity) lastActive.set(a.uid, Math.max(lastActive.get(a.uid) ?? 0, a.at));
  for (const m of members) {
    if (!m.programId || !m.totalWorkouts) continue;
    const p = progs.get(m.programId) ?? { name: m.programName || m.programId, pcts: [], half: 0, stalled: 0 };
    const pct = Math.min(100, ((m.completedWorkouts ?? 0) / m.totalWorkouts) * 100);
    p.pcts.push(pct);
    if (pct >= 50) p.half++;
    // Enrolled, not finished, nothing logged for 14 days.
    if (pct < 100 && (now - (lastActive.get(m.uid) ?? 0)) > 14 * DAY) p.stalled++;
    progs.set(m.programId, p);
  }
  const programs = [...progs.entries()]
    .map(([programId, p]) => ({
      programId, name: p.name, enrolled: p.pcts.length,
      avgPct: Math.round(p.pcts.reduce((a, b) => a + b, 0) / p.pcts.length),
      finishedHalf: rate(p.half, p.pcts.length), stalled: p.stalled,
    }))
    .sort((a, b) => b.enrolled - a.enrolled);

  return {
    generatedAt: now,
    totals: { members: members.length, dau: activeSince(DAY), wau: activeSince(7 * DAY), mau: activeSince(30 * DAY) },
    overall: measure(recent),
    cohorts,
    programs,
  };
}
