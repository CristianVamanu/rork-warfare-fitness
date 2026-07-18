/**
 * Built-in seed programs used as fallback when Firestore programs collection
 * is empty. Each program has a full 7-day weekly schedule (index 0 = Monday).
 */

import type { Program, ProgramDay } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rest(): ProgramDay {
  return { label: 'Rest', isRest: true, exercises: [] };
}

// ---------------------------------------------------------------------------
// Program definitions
// ---------------------------------------------------------------------------

export const MOCK_PROGRAMS: Program[] = [
  // ── P1: Powerlifting Foundations ─────────────────────────────────────────
  {
    id: 'p1',
    name: 'Powerlifting Foundations',
    description: 'Build serious strength with the big 3 movements. Progressive overload every session.',
    level: 'intermediate',
    goal: 'strength',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p1-e1', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
      { id: 'p1-e2', name: 'Bench Press', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'chest' },
      { id: 'p1-e3', name: 'Conventional Deadlift', sets: 3, reps: 3, restSeconds: 240, muscleGroup: 'back' },
      { id: 'p1-e4', name: 'Overhead Press', sets: 4, reps: 6, restSeconds: 120, muscleGroup: 'shoulders' },
    ],
    schedule: [
      {
        label: 'Squat & Deadlift',
        isRest: false,
        exercises: [
          { id: 'p1-e1', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
          { id: 'p1-e3', name: 'Conventional Deadlift', sets: 3, reps: 3, restSeconds: 240, muscleGroup: 'back' },
          { id: 'p1-e5', name: 'Romanian Deadlift', sets: 3, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p1-e6', name: 'Leg Press', sets: 3, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
        ],
      },
      {
        label: 'Bench & Row',
        isRest: false,
        exercises: [
          { id: 'p1-e2', name: 'Bench Press', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'chest' },
          { id: 'p1-e7', name: 'Barbell Row', sets: 4, reps: 6, restSeconds: 120, muscleGroup: 'back' },
          { id: 'p1-e8', name: 'Incline Dumbbell Press', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p1-e9', name: 'Cable Row', sets: 3, reps: 10, restSeconds: 90, muscleGroup: 'back' },
        ],
      },
      rest(),
      {
        label: 'OHP & Accessories',
        isRest: false,
        exercises: [
          { id: 'p1-e4', name: 'Overhead Press', sets: 4, reps: 6, restSeconds: 120, muscleGroup: 'shoulders' },
          { id: 'p1-e10', name: 'Pull-Up / Lat Pulldown', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p1-e11', name: 'Lateral Raise', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'shoulders' },
          { id: 'p1-e12', name: 'Tricep Pushdown', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      {
        label: 'Heavy Squat',
        isRest: false,
        exercises: [
          { id: 'p1-e1', name: 'Barbell Back Squat', sets: 5, reps: 3, restSeconds: 210, muscleGroup: 'legs' },
          { id: 'p1-e2', name: 'Bench Press', sets: 4, reps: 4, restSeconds: 180, muscleGroup: 'chest' },
          { id: 'p1-e13', name: 'Hack Squat', sets: 3, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p1-e14', name: 'Chest Fly', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
        ],
      },
      rest(),
      rest(),
    ],
  },

  // ── P2: Hypertrophy Program ───────────────────────────────────────────────
  {
    id: 'p2',
    name: 'Hypertrophy Program',
    description: 'Maximize muscle growth with high-volume push/pull/legs splits.',
    level: 'intermediate',
    goal: 'hypertrophy',
    weeks: 12,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p2-e1', name: 'Incline Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
      { id: 'p2-e2', name: 'Cable Row', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p2-e3', name: 'Leg Press', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
      { id: 'p2-e4', name: 'Overhead Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'shoulders' },
    ],
    schedule: [
      {
        label: 'Push (Chest / Shoulders / Triceps)',
        isRest: false,
        exercises: [
          { id: 'p2-e1', name: 'Incline Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p2-e5', name: 'Flat Dumbbell Press', sets: 4, reps: 12, restSeconds: 75, muscleGroup: 'chest' },
          { id: 'p2-e4', name: 'Overhead Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p2-e6', name: 'Lateral Raise', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'shoulders' },
          { id: 'p2-e7', name: 'Tricep Pushdown', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      {
        label: 'Pull (Back / Biceps)',
        isRest: false,
        exercises: [
          { id: 'p2-e8', name: 'Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p2-e2', name: 'Cable Row', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p2-e9', name: 'Lat Pulldown', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p2-e10', name: 'Face Pull', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'shoulders' },
          { id: 'p2-e11', name: 'Barbell Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      {
        label: 'Legs',
        isRest: false,
        exercises: [
          { id: 'p2-e12', name: 'Barbell Back Squat', sets: 4, reps: 10, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p2-e3', name: 'Leg Press', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p2-e13', name: 'Romanian Deadlift', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p2-e14', name: 'Leg Curl', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p2-e15', name: 'Calf Raise', sets: 4, reps: 20, restSeconds: 45, muscleGroup: 'legs' },
        ],
      },
      rest(),
      {
        label: 'Push (Variation)',
        isRest: false,
        exercises: [
          { id: 'p2-e16', name: 'Flat Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p2-e17', name: 'Cable Fly', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p2-e18', name: 'Dumbbell Shoulder Press', sets: 4, reps: 12, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p2-e7', name: 'Tricep Pushdown', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      {
        label: 'Pull (Variation)',
        isRest: false,
        exercises: [
          { id: 'p2-e19', name: 'Seated Cable Row', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p2-e20', name: 'Single Arm DB Row', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p2-e21', name: 'Hammer Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
          { id: 'p2-e22', name: 'Rear Delt Fly', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'shoulders' },
        ],
      },
      rest(),
    ],
  },

  // ── P3: Beginner Full Body ────────────────────────────────────────────────
  {
    id: 'p3',
    name: 'Beginner Full Body',
    description: 'Perfect starting point. 3 full-body sessions per week with compound movements.',
    level: 'beginner',
    goal: 'general',
    weeks: 6,
    daysPerWeek: 3,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p3-e1', name: 'Goblet Squat', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
      { id: 'p3-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'chest' },
      { id: 'p3-e3', name: 'Dumbbell Row', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'back' },
      { id: 'p3-e4', name: 'Dumbbell Shoulder Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'shoulders' },
    ],
    schedule: [
      {
        label: 'Full Body A',
        isRest: false,
        exercises: [
          { id: 'p3-e1', name: 'Goblet Squat', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p3-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'chest' },
          { id: 'p3-e3', name: 'Dumbbell Row', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p3-e4', name: 'Dumbbell Shoulder Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p3-e5', name: 'Plank', sets: 3, reps: 30, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Full Body B',
        isRest: false,
        exercises: [
          { id: 'p3-e6', name: 'Romanian Deadlift', sets: 3, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p3-e7', name: 'Dumbbell Bench Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'chest' },
          { id: 'p3-e8', name: 'Lat Pulldown', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p3-e9', name: 'Lateral Raise', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'shoulders' },
          { id: 'p3-e10', name: 'Bicycle Crunch', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Full Body C',
        isRest: false,
        exercises: [
          { id: 'p3-e1', name: 'Goblet Squat', sets: 3, reps: 14, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p3-e7', name: 'Dumbbell Bench Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'chest' },
          { id: 'p3-e3', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p3-e4', name: 'Dumbbell Shoulder Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p3-e5', name: 'Plank', sets: 3, reps: 45, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      rest(),
      rest(),
    ],
  },

  // ── P4: Fat Loss HIIT ─────────────────────────────────────────────────────
  {
    id: 'p4',
    name: 'Fat Loss HIIT',
    description: 'High-intensity circuit training to maximise calorie burn and build conditioning.',
    level: 'beginner',
    goal: 'weight-loss',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p4-e1', name: 'Burpee', sets: 4, reps: 10, restSeconds: 60, muscleGroup: 'full-body' },
      { id: 'p4-e2', name: 'Jump Squat', sets: 4, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
      { id: 'p4-e3', name: 'Mountain Climber', sets: 4, reps: 30, restSeconds: 45, muscleGroup: 'core' },
      { id: 'p4-e4', name: 'Push-Up', sets: 4, reps: 15, restSeconds: 45, muscleGroup: 'chest' },
    ],
    schedule: [
      {
        label: 'HIIT Circuit A',
        isRest: false,
        exercises: [
          { id: 'p4-e1', name: 'Burpee', sets: 4, reps: 10, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p4-e2', name: 'Jump Squat', sets: 4, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
          { id: 'p4-e3', name: 'Mountain Climber', sets: 4, reps: 30, restSeconds: 45, muscleGroup: 'core' },
          { id: 'p4-e4', name: 'Push-Up', sets: 4, reps: 15, restSeconds: 45, muscleGroup: 'chest' },
          { id: 'p4-e5', name: 'High Knees', sets: 4, reps: 40, restSeconds: 30, muscleGroup: 'full-body' },
        ],
      },
      rest(),
      {
        label: 'Strength Circuit',
        isRest: false,
        exercises: [
          { id: 'p4-e6', name: 'Goblet Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p4-e7', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'back' },
          { id: 'p4-e4', name: 'Push-Up', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p4-e8', name: 'Reverse Lunge', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p4-e9', name: 'Plank', sets: 3, reps: 40, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'HIIT Circuit B',
        isRest: false,
        exercises: [
          { id: 'p4-e1', name: 'Burpee', sets: 5, reps: 8, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p4-e10', name: 'Box Jump', sets: 4, reps: 10, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p4-e11', name: 'Kettlebell Swing', sets: 4, reps: 20, restSeconds: 45, muscleGroup: 'full-body' },
          { id: 'p4-e3', name: 'Mountain Climber', sets: 4, reps: 30, restSeconds: 30, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Active Recovery',
        isRest: false,
        exercises: [
          { id: 'p4-e12', name: 'Walking Lunge', sets: 3, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p4-e13', name: 'Band Pull-Apart', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'shoulders' },
          { id: 'p4-e9', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
    ],
  },
];

/** Look up a mock program by id. Returns null if not found. */
export function getMockProgram(id: string): Program | null {
  return MOCK_PROGRAMS.find((p) => p.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Program matching — onboarding assigns a user into an existing plan from
// the library (admin-created programs in Firestore, or these seed programs
// as a fallback) rather than having AI invent a new one from scratch. This
// keeps quality consistent (a human designed every plan) and cuts an entire
// OpenAI round-trip out of onboarding.
// ---------------------------------------------------------------------------

const GOAL_TO_PROGRAM_GOAL: Record<string, Program['goal']> = {
  'lose-fat': 'weight-loss',
  'build-muscle': 'hypertrophy',
  recomposition: 'hypertrophy',
  strength: 'strength',
};

/**
 * Scores every candidate program against the user's onboarding answers and
 * returns the best fit. Sex/height/weight are deliberately NOT used to
 * include/exclude programs — every program is appropriate for any athlete;
 * biometrics only matter for calorie targets (handled separately) and for
 * calibrating starting loads once training, not for which plan gets picked.
 */
export function pickBestProgram(
  pool: Program[],
  goal: string,
  experience: string,
  trainingDays: number
): Program | null {
  if (pool.length === 0) return null;
  const targetGoal = GOAL_TO_PROGRAM_GOAL[goal] ?? goal;
  const levelRank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

  const scored = pool.map((p) => {
    let score = 0;
    if (p.goal === targetGoal) score += 10;
    else if (p.goal === 'general') score += 4; // general programs are a reasonable fallback for any goal
    const levelGap = Math.abs((levelRank[p.level] ?? 1) - (levelRank[experience] ?? 1));
    score += levelGap === 0 ? 6 : levelGap === 1 ? 2 : 0;
    score -= Math.abs(p.daysPerWeek - trainingDays);
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].p;
}

const WEEKDAY_PREFIX = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*[-–—]?\s*/i;

/**
 * Strips weekday prefix from a day label so programs always show
 * theme-based names ("Push Day") rather than calendar names ("Monday - Push Day").
 */
export function stripWeekdayPrefix(label: string): string {
  return label.replace(WEEKDAY_PREFIX, '').trim() || label;
}

/**
 * Returns the ProgramDay for the current user based on days since enrollment.
 * Falls back to day-of-week logic for legacy users without programStartDate.
 */
export function getProgramDayForUser(
  program: Program,
  programStartDate?: string
): ProgramDay | null {
  const schedule = program.schedule;
  if (!schedule?.length) return null;

  if (programStartDate) {
    const start = new Date(programStartDate);
    const dayIndex = Math.floor((Date.now() - start.getTime()) / 86400000);
    return schedule[dayIndex % schedule.length] ?? null;
  }
  // fallback to DOW for existing users without programStartDate
  return getProgramDayForDow(program, (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })());
}

/**
 * Returns the ProgramDay for a given day of week (0 = Monday … 6 = Sunday)
 * from a program's schedule, cycling if the week pattern is shorter.
 */
export function getProgramDayForDow(program: Program, dow: number): ProgramDay | null {
  const schedule = program.schedule;
  if (!schedule || schedule.length === 0) {
    if (program.exercises.length === 0) return null;
    // Flat exercise list — treat every day as a training day
    return { label: 'Training', isRest: false, exercises: program.exercises };
  }
  return schedule[dow % schedule.length] ?? null;
}
