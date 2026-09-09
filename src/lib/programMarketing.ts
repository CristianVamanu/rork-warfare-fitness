import type { Program, ProgramDay } from '@/types';

/**
 * Marketing copy for a program page, derived entirely from that program's own
 * data.
 *
 * Nothing here is invented. Every claim on the page — the week count, the
 * session count, the phase names, the sample workouts — is computed from the
 * program document, so the page cannot promise a twelve-week programme that is
 * actually eight, and an admin editing a program in the panel updates its
 * marketing page in the same act. The alternative (hand-written copy per
 * program) rots the first time someone edits a schedule.
 *
 * The prose is deliberately plain about what the buyer gets. Search engines
 * reward pages that answer the question the searcher actually typed, and a
 * fitness page that hides the training behind hype answers nothing.
 */

const GOAL_LABEL: Record<Program['goal'], string> = {
  strength: 'Strength',
  hypertrophy: 'Muscle Building',
  endurance: 'Endurance',
  'weight-loss': 'Fat Loss',
  general: 'General Fitness',
};

const GOAL_PROMISE: Record<Program['goal'], string> = {
  strength: 'get measurably stronger under load',
  hypertrophy: 'add real muscle',
  endurance: 'build engine and work capacity',
  'weight-loss': 'strip fat while keeping the strength you have',
  general: 'get fitter, harder to kill, and better at everything',
};

const LEVEL_LABEL: Record<Program['level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const LEVEL_REQUIREMENT: Record<Program['level'], string> = {
  beginner: 'No training background needed. If you can commit to the schedule, you can start this week.',
  intermediate: 'Assumes you already train and know the basic lifts. Not a first program.',
  advanced: 'Built for people already training hard. Expect it to hurt.',
};

export interface ProgramMarketing {
  /** <title> — the phrase someone would actually search. */
  seoTitle: string;
  /** <meta description>, ~155 chars. */
  seoDescription: string;
  headline: string;
  subheadline: string;
  stats: { label: string; value: string }[];
  whoFor: string;
  requirement: string;
  /** Phase-by-phase structure, real week ranges from the program. */
  phases: { label: string; weeks: string; focus: string }[];
  /** A representative training week — labels only, no full prescriptions. */
  weekPattern: { label: string; isRest: boolean; exerciseCount: number }[];
  /** Two real sessions, exercises included: the proof the program is real. */
  sampleSessions: { label: string; exercises: { name: string; detail: string }[] }[];
  totalSessions: number;
  includes: string[];
}

function scheduleOf(p: Program): ProgramDay[] {
  if (p.phases?.length && p.phases[0]?.schedule?.length) return p.phases[0].schedule;
  return p.schedule ?? [];
}

function exerciseDetail(e: { sets: number; reps: number | string; restSeconds?: number; isCardio?: boolean }): string {
  const reps = typeof e.reps === 'string' ? e.reps : `${e.reps}`;
  // A cardio "rep" is seconds per round, not a repetition — saying "12 reps"
  // for a 45-second sprint interval would read as nonsense to anyone who
  // actually trains, which is exactly the audience this page has to convince.
  const unit = e.isCardio && /^\d+$/.test(reps) ? `${reps}s` : `${reps} reps`;
  const rest = e.restSeconds ? ` · ${e.restSeconds}s rest` : '';
  return `${e.sets} × ${unit}${rest}`;
}

export function buildProgramMarketing(p: Program): ProgramMarketing {
  const schedule = scheduleOf(p);
  const trainingDays = schedule.filter((d) => !d.isRest);
  const totalSessions = p.weeks * p.daysPerWeek;
  const goalLabel = GOAL_LABEL[p.goal] ?? 'Fitness';

  const phases = (p.phases ?? []).map((ph) => ({
    label: ph.label,
    weeks: ph.startWeek === ph.endWeek ? `Week ${ph.startWeek}` : `Weeks ${ph.startWeek}–${ph.endWeek}`,
    focus: (ph.schedule ?? []).filter((d) => !d.isRest).map((d) => d.label).join(' · '),
  }));

  const sampleSessions = trainingDays.slice(0, 2).map((d) => ({
    label: d.label,
    // Six is enough to prove the session is real without publishing the
    // programme. The value being sold is the full progression, the tracking
    // and the coaching — not a list anyone could retype.
    exercises: (d.exercises ?? []).slice(0, 6).map((e) => ({
      name: e.name,
      detail: exerciseDetail(e),
    })),
  }));

  return {
    seoTitle: `${p.name} — ${p.weeks}-Week ${goalLabel} Program`,
    seoDescription:
      `${p.name}: a ${p.weeks}-week, ${p.daysPerWeek}-day-a-week ${goalLabel.toLowerCase()} program. ` +
      `${totalSessions} structured sessions with progression built in. See the full plan and sample workouts.`,
    headline: p.name,
    subheadline:
      `${p.weeks} weeks · ${p.daysPerWeek} days a week · ${LEVEL_LABEL[p.level]} — built to ${GOAL_PROMISE[p.goal] ?? 'get you fitter'}.`,
    stats: [
      { label: 'Length', value: `${p.weeks} weeks` },
      { label: 'Frequency', value: `${p.daysPerWeek}×/week` },
      { label: 'Sessions', value: `${totalSessions}` },
      { label: 'Level', value: LEVEL_LABEL[p.level] },
    ],
    whoFor: p.description,
    requirement: LEVEL_REQUIREMENT[p.level],
    phases,
    weekPattern: schedule.map((d) => ({
      label: d.label,
      isRest: d.isRest,
      exerciseCount: (d.exercises ?? []).length,
    })),
    sampleSessions,
    totalSessions,
    includes: [
      'Every session laid out day by day — no guessing what to do',
      'Sets, reps, tempo and rest prescribed for each exercise',
      'Progress tracked automatically as you complete workouts',
      'Swap or substitute exercises when equipment is short',
      'Calorie and macro targets calculated for your body and goal',
      'Community channels and the PR wall alongside people doing the same program',
    ],
  };
}
