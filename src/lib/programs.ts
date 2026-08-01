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

  // ── P5: Commando Prep (Royal Marines-inspired) ───────────────────────────
  {
    id: 'p5',
    name: 'Commando Prep',
    // Built toward the published Royal Marines Candidate Preparation
    // standard: 30 push-ups, 40 sit-ups, 4 pull-ups minimum, and a 1.5-mile
    // run under 11:15. Track your numbers against these targets on the PT
    // Test page (Commando PT Test standard).
    description: 'Do you have what it takes to be a Royal Marines Commando? An 8-week base-building program toward the real published entry standard: 30 push-ups, 40 sit-ups, 4 pull-ups, and a 1.5-mile run under 11:15.',
    level: 'beginner',
    goal: 'weight-loss',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p5-e1', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p5-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p5-e3', name: '1.5-Mile Timed Run', sets: 1, reps: '1.5mi', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p5-e4', name: 'Sit-Up', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
    ],
    schedule: [
      {
        label: 'Fireteam Fitness Test',
        isRest: false,
        exercises: [
          { id: 'p5-e1', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p5-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 60, muscleGroup: 'chest', notes: 'Build toward 30 in one set — the Commando PT Test standard.' },
          { id: 'p5-e4', name: 'Sit-Up', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core', notes: 'Build toward 40 in one set — the Commando PT Test standard.' },
          { id: 'p5-e6', name: 'Plank', sets: 3, reps: 30, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Pull-Up Foundation',
        isRest: false,
        exercises: [
          { id: 'p5-e12', name: 'Assisted Pull-Up', sets: 4, reps: 6, restSeconds: 75, muscleGroup: 'back', notes: 'Progress toward 4 strict pull-ups unassisted — the Commando PT Test minimum.' },
          { id: 'p5-e5', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'back' },
          { id: 'p5-e7', name: 'Walking Lunge', sets: 3, reps: 16, restSeconds: 60, muscleGroup: 'legs' },
        ],
      },
      rest(),
      {
        label: 'Circuit Training',
        isRest: false,
        exercises: [
          { id: 'p5-e9', name: 'Jumping Jack', sets: 4, reps: 30, restSeconds: 30, muscleGroup: 'cardio' },
          { id: 'p5-e2', name: 'Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p5-e1', name: 'Bodyweight Squat', sets: 3, reps: 18, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p5-e6', name: 'Plank', sets: 3, reps: 40, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p5-e3', name: '1.5-Mile Timed Run', sets: 1, reps: '1.5mi', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 11:15. Log your time on the PT Test page.' },
          { id: 'p5-e10', name: 'Dumbbell Goblet Squat', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'legs' },
          { id: 'p5-e11', name: 'Dumbbell Shoulder Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'shoulders' },
        ],
      },
      rest(),
    ],
  },

  // ── P6: Ranger Assessment (US Army Rangers-inspired) ─────────────────────
  {
    id: 'p6',
    name: 'Ranger Assessment',
    // Built toward the published pre-RASP entry standard: 53 push-ups, 63
    // sit-ups, 4 pull-ups, and a 2-mile run under 14:30. Track your numbers
    // on the PT Test page (Ranger Assessment standard).
    description: 'Do you have what it takes to be an Army Ranger? A 10-week program toward the real published pre-RASP standard: 53 push-ups, 63 sit-ups, 4 pull-ups, and a 2-mile run under 14:30.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 10,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p6-e1', name: 'Weighted Ruck March', sets: 1, reps: '4 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p6-e2', name: 'Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p6-e3', name: 'Front Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
      { id: 'p6-e4', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
    ],
    schedule: [
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p6-e1', name: 'Weighted Ruck March', sets: 1, reps: '4 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          { id: 'p6-e5', name: 'Bodyweight Lunge', sets: 3, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
        ],
      },
      {
        label: 'Tactical Strength A',
        isRest: false,
        exercises: [
          { id: 'p6-e3', name: 'Front Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p6-e2', name: 'Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 4+ strict reps — the RASP entry minimum.' },
          { id: 'p6-e6', name: 'Kettlebell Swing', sets: 3, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p6-e12', name: 'Sit-Up', sets: 4, reps: 20, restSeconds: 45, muscleGroup: 'core', notes: 'Build toward 63 in 2 minutes — the RASP entry standard.' },
        ],
      },
      {
        label: 'Interval Sprints',
        isRest: false,
        exercises: [
          { id: 'p6-e8', name: 'Sprint Intervals (30s on / 90s off)', sets: 8, reps: 1, restSeconds: 90, muscleGroup: 'cardio', isCardio: true },
          { id: 'p6-e4', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest', notes: 'Build toward 53 in 2 minutes — the RASP entry standard.' },
        ],
      },
      {
        label: 'Tactical Strength B',
        isRest: false,
        exercises: [
          { id: 'p6-e9', name: 'Deadlift', sets: 4, reps: 6, restSeconds: 150, muscleGroup: 'back' },
          { id: 'p6-e10', name: 'Dumbbell Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p6-e11', name: 'Farmer’s Carry', sets: 3, reps: '40m', restSeconds: 75, muscleGroup: 'full-body' },
        ],
      },
      rest(),
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p6-e13', name: '2-Mile Timed Run', sets: 1, reps: '2mi', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 14:30. Log your time on the PT Test page.' },
          { id: 'p6-e7', name: 'Hanging Leg Raise', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      rest(),
    ],
  },

  // ── P7: Recon Fit (Marine Force Recon-inspired) ──────────────────────────
  {
    id: 'p7',
    name: 'Recon Fit',
    // Built toward a Force Recon-competitive standard: 20 pull-ups and a
    // 3-mile run under 18:00 — well above the standard Marine PFT minimum.
    // Track your numbers on the PT Test page (Force Recon Prep standard).
    description: 'Do you have what it takes to be a Force Recon Marine? An 8-week program toward a Recon-competitive standard: 20 pull-ups and a 3-mile run under 18:00.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p7-e1', name: 'Pull-Up', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p7-e2', name: 'Timed Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p7-e3', name: 'Ammo-Can Carry (use kettlebell)', sets: 3, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
      { id: 'p7-e4', name: 'Sit-Up', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
    ],
    schedule: [
      {
        label: 'PFT Prep',
        isRest: false,
        exercises: [
          { id: 'p7-e1', name: 'Pull-Up', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 20 reps — the Force Recon-competitive standard.' },
          { id: 'p7-e4', name: 'Sit-Up', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
          { id: 'p7-e2', name: 'Timed Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Functional Strength',
        isRest: false,
        exercises: [
          { id: 'p7-e5', name: 'Barbell Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p7-e3', name: 'Ammo-Can Carry (use kettlebell)', sets: 3, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
          { id: 'p7-e6', name: 'Dumbbell Row', sets: 4, reps: 12, restSeconds: 75, muscleGroup: 'back' },
        ],
      },
      rest(),
      {
        label: 'CFT Circuit',
        isRest: false,
        exercises: [
          { id: 'p7-e7', name: 'Sandbag / Dumbbell Carry', sets: 4, reps: '40m', restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p7-e8', name: 'Burpee', sets: 4, reps: 12, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p7-e1', name: 'Pull-Up', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'back' },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p7-e2', name: '3-Mile Timed Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 18:00. Log your time on the PT Test page.' },
          { id: 'p7-e9', name: 'Pull-Up Max Test', sets: 1, reps: 'AMRAP', restSeconds: 0, muscleGroup: 'back', notes: 'Target: 20+ reps. Log your number on the PT Test page.' },
          { id: 'p7-e4', name: 'Sit-Up', sets: 3, reps: 30, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      rest(),
    ],
  },

  // ── P8: Spetsnaz Strength (Russian Spetsnaz-inspired) ────────────────────
  {
    id: 'p8',
    name: 'Spetsnaz Selection Prep',
    // Built backward from the actual published (unclassified) Spetsnaz
    // selection PT standard — 20 strict pull-ups, 90 push-ups in 2 minutes,
    // and a 3km run under 10:30 — so "you could pass it" is a real claim
    // this program is periodized toward, not just branding. Track your
    // numbers against these exact targets on the PT Test page (Spetsnaz
    // Selection standard).
    description: 'Do you have what it takes to be Spetsnaz? A 10-week program built to get you to the real published entry standard: 20 pull-ups, 90 push-ups in 2 minutes, and a sub-10:30 3km run.',
    level: 'advanced',
    goal: 'endurance',
    weeks: 10,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p8-e1', name: 'Pull-Up Ladder', sets: 5, reps: 'ladder to failure', restSeconds: 90, muscleGroup: 'back' },
      { id: 'p8-e2', name: 'Push-Up EMOM', sets: 10, reps: 'max in 40s', restSeconds: 20, muscleGroup: 'chest' },
      { id: 'p8-e3', name: '3km Tempo Run', sets: 1, reps: '3km', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p8-e4', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
    ],
    schedule: [
      {
        label: 'Pull-Up Density',
        isRest: false,
        exercises: [
          { id: 'p8-e1', name: 'Pull-Up Ladder', sets: 5, reps: 'ladder to failure', restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 20 strict reps: ladder 1-2-3...up until you can no longer add a rung.' },
          { id: 'p8-e5', name: 'Barbell Row', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'back' },
          { id: 'p8-e6', name: 'Hanging Leg Raise', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Push-Up Endurance + Intervals',
        isRest: false,
        exercises: [
          { id: 'p8-e2', name: 'Push-Up EMOM', sets: 10, reps: 'max in 40s', restSeconds: 20, muscleGroup: 'chest', notes: 'Target: 90+ total reps across the set inside 2 minutes of work.' },
          { id: 'p8-e7', name: 'Bench Press', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p8-e8', name: '400m Run Intervals', sets: 8, reps: '0.4km', restSeconds: 90, muscleGroup: 'cardio', isCardio: true },
          { id: 'p8-e9', name: 'Plank', sets: 4, reps: '60s', restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Heavy Strength (Durability Base)',
        isRest: false,
        exercises: [
          { id: 'p8-e4', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
          { id: 'p8-e10', name: 'Deadlift', sets: 5, reps: 5, restSeconds: 180, muscleGroup: 'back' },
          { id: 'p8-e11', name: 'Overhead Press', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'shoulders' },
        ],
      },
      {
        label: '3km Tempo + Grip Conditioning',
        isRest: false,
        exercises: [
          { id: 'p8-e3', name: '3km Tempo Run', sets: 1, reps: '3km', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Run at goal pace: aim for sub-3:30/km to build toward the 10:30 standard.' },
          { id: 'p8-e12', name: "Farmer's Carry", sets: 4, reps: '40m', restSeconds: 75, muscleGroup: 'full-body' },
          { id: 'p8-e13', name: 'Kettlebell Swing', sets: 5, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p8-e14', name: 'Push-Up Max Test', sets: 1, reps: 'AMRAP in 2min', restSeconds: 0, muscleGroup: 'chest', notes: 'Target: 90+ reps. Log your number on the PT Test page.' },
          { id: 'p8-e15', name: 'Pull-Up Max Test', sets: 1, reps: 'AMRAP', restSeconds: 0, muscleGroup: 'back', notes: 'Target: 20+ strict reps. Log your number on the PT Test page.' },
          { id: 'p8-e16', name: 'Burpee', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p8-e17', name: 'Russian Twist', sets: 4, reps: 20, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
    ],
  },

  // ── P9: KSK Hybrid (German KSK-inspired) ─────────────────────────────────
  {
    id: 'p9',
    name: 'KSK Hybrid',
    // Built toward the published German KSK field endurance standard: a 7km
    // ruck march with a 20kg pack under 52:00. Track your time on the PT
    // Test page (KSK Selection standard).
    description: 'Do you have what it takes to be KSK? A 10-week strength-and-hypertrophy hybrid toward the real published endurance standard: a 7km ruck with a 20kg pack under 52:00.',
    level: 'intermediate',
    goal: 'hypertrophy',
    weeks: 10,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p9-e1', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
      { id: 'p9-e2', name: 'Weighted Dip', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
      { id: 'p9-e3', name: 'Weighted Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p9-e4', name: 'Farmer’s Carry', sets: 3, reps: '40m', restSeconds: 75, muscleGroup: 'full-body' },
    ],
    schedule: [
      {
        label: 'Push Hybrid',
        isRest: false,
        exercises: [
          { id: 'p9-e2', name: 'Weighted Dip', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p9-e5', name: 'Overhead Press', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'shoulders' },
          { id: 'p9-e6', name: 'Incline Dumbbell Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'chest' },
          { id: 'p9-e7', name: 'Tricep Dip', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      {
        label: 'Pull Hybrid',
        isRest: false,
        exercises: [
          { id: 'p9-e3', name: 'Weighted Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p9-e8', name: 'Barbell Row', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p9-e9', name: 'Face Pull', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'shoulders' },
          { id: 'p9-e10', name: 'Dumbbell Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
        ],
      },
      rest(),
      {
        label: 'Leg Hybrid',
        isRest: false,
        exercises: [
          { id: 'p9-e1', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p9-e11', name: 'Romanian Deadlift', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
          { id: 'p9-e12', name: 'Walking Lunge', sets: 3, reps: 20, restSeconds: 75, muscleGroup: 'legs' },
        ],
      },
      {
        label: 'Functional Carry Day',
        isRest: false,
        exercises: [
          { id: 'p9-e4', name: 'Farmer’s Carry', sets: 4, reps: '40m', restSeconds: 75, muscleGroup: 'full-body' },
          { id: 'p9-e13', name: 'Sandbag Shoulder Carry', sets: 3, reps: '40m', restSeconds: 75, muscleGroup: 'full-body' },
          { id: 'p9-e14', name: 'Hanging Leg Raise', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p9-e15', name: '7km Ruck March (20kg)', sets: 1, reps: '7km', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 52:00. Log your time on the PT Test page.' },
        ],
      },
      rest(),
    ],
  },

  // ── P10: Legion Endurance (French Foreign Legion-inspired) ───────────────
  {
    id: 'p10',
    name: 'Legion Endurance',
    // Built toward the published French Foreign Legion recruiting-station
    // standard: 7 strict pull-ups from a dead hang. Track your number on
    // the PT Test page (Legion Selection standard).
    description: 'Do you have what it takes to join the French Foreign Legion? A 12-week progressive-overload rucking program toward the real published entry standard: 7 strict pull-ups from a dead hang.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p10-e2', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p10-e3', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p10-e4', name: 'Pull-Up', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'back' },
    ],
    schedule: [
      {
        label: 'March Day',
        isRest: false,
        exercises: [
          { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Bodyweight Strength',
        isRest: false,
        exercises: [
          { id: 'p10-e2', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p10-e3', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p10-e4', name: 'Pull-Up', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 7 strict dead-hang reps — the Legion entry standard.' },
        ],
      },
      {
        label: 'Run + Core',
        isRest: false,
        exercises: [
          { id: 'p10-e5', name: 'Steady-State Run', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          { id: 'p10-e6', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Long March',
        isRest: false,
        exercises: [
          { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Full Body Strength',
        isRest: false,
        exercises: [
          { id: 'p10-e7', name: 'Barbell Deadlift', sets: 4, reps: 6, restSeconds: 150, muscleGroup: 'back' },
          { id: 'p10-e8', name: 'Dumbbell Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p10-e9', name: 'Pull-Up Max Test', sets: 1, reps: 'AMRAP', restSeconds: 0, muscleGroup: 'back', notes: 'Target: 7+ strict dead-hang reps. Log your number on the PT Test page.' },
        ],
      },
      rest(),
    ],
  },

  // ── P11: Commando Combatives (IDF-inspired) ──────────────────────────────
  {
    id: 'p11',
    name: 'Commando Combatives',
    // Built toward the published Royal Marines Endurance Course standard: 6
    // miles carrying 21lb fighting order under 73:00. Track your time on
    // the PT Test page (Commando Endurance standard).
    description: 'Do you have what it takes to complete the Commando Endurance Course? An 8-week kettlebell-and-bodyweight combatives program toward the real published standard: 6 miles carrying 21lb under 73:00.',
    level: 'intermediate',
    goal: 'general',
    weeks: 8,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p11-e1', name: 'Kettlebell Swing', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
      { id: 'p11-e2', name: 'Burpee', sets: 4, reps: 12, restSeconds: 60, muscleGroup: 'full-body' },
      { id: 'p11-e3', name: 'Push-Up', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p11-e4', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
    ],
    schedule: [
      {
        label: 'Combatives Circuit A',
        isRest: false,
        exercises: [
          { id: 'p11-e1', name: 'Kettlebell Swing', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p11-e2', name: 'Burpee', sets: 4, reps: 12, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p11-e5', name: 'Mountain Climber', sets: 4, reps: 30, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Strength Base',
        isRest: false,
        exercises: [
          { id: 'p11-e4', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p11-e3', name: 'Push-Up', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p11-e6', name: 'Dumbbell Row', sets: 4, reps: 12, restSeconds: 75, muscleGroup: 'back' },
        ],
      },
      rest(),
      {
        label: 'Combatives Circuit B',
        isRest: false,
        exercises: [
          { id: 'p11-e7', name: 'Kettlebell Clean & Press', sets: 4, reps: 10, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p11-e8', name: 'Jump Squat', sets: 4, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
          { id: 'p11-e9', name: 'Plank', sets: 3, reps: 45, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Conditioning Run',
        isRest: false,
        exercises: [
          { id: 'p11-e10', name: 'Interval Run (1 min hard / 1 min easy)', sets: 10, reps: 1, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p11-e11', name: '6-Mile Load Carry (21lb)', sets: 1, reps: '6 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 73:00 carrying 21lb. Log your time on the PT Test page.' },
        ],
      },
      rest(),
    ],
  },

  // ── P12: SEAL Selection (US Navy SEALs-inspired) ─────────────────────────
  {
    id: 'p12',
    name: 'SEAL Selection',
    // Built toward the published Navy SEAL Physical Screening Test (PST)
    // minimums: 42 push-ups, 50 sit-ups, 10 pull-ups, and a 1.5-mile run
    // under 10:30. Track your numbers on the PT Test page (SEAL Selection
    // standard).
    description: 'Do you have what it takes to be a Navy SEAL? A 12-week advanced program toward the real published PST minimums: 42 push-ups, 50 sit-ups, 10 pull-ups, and a 1.5-mile run under 10:30.',
    level: 'advanced',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p12-e1', name: 'Pull-Up', sets: 5, reps: 12, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p12-e2', name: 'Push-Up', sets: 5, reps: 25, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '1000m', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p12-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
    ],
    schedule: [
      {
        label: 'PT Test Prep',
        isRest: false,
        exercises: [
          { id: 'p12-e1', name: 'Pull-Up', sets: 5, reps: 12, restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 10+ reps — the PST minimum.' },
          { id: 'p12-e2', name: 'Push-Up', sets: 5, reps: 25, restSeconds: 60, muscleGroup: 'chest', notes: 'Build toward 42 in 2 minutes — the PST minimum.' },
          { id: 'p12-e5', name: 'Sit-Up', sets: 4, reps: 25, restSeconds: 45, muscleGroup: 'core', notes: 'Build toward 50 in 2 minutes — the PST minimum.' },
        ],
      },
      {
        label: 'Swim Conditioning',
        isRest: false,
        exercises: [
          { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '1000m', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          { id: 'p12-e6', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Strength Circuit',
        isRest: false,
        exercises: [
          { id: 'p12-e7', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p12-e8', name: 'Weighted Dip', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
          { id: 'p12-e9', name: 'Kettlebell Swing', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
        ],
      },
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p12-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Mental Toughness Finisher',
        isRest: false,
        exercises: [
          { id: 'p12-e10', name: 'Burpee', sets: 6, reps: 15, restSeconds: 45, muscleGroup: 'full-body' },
          { id: 'p12-e1', name: 'Pull-Up', sets: 4, reps: 10, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p12-e11', name: 'Bear Crawl', sets: 4, reps: '20m', restSeconds: 60, muscleGroup: 'full-body' },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p12-e12', name: '1.5-Mile Timed Run', sets: 1, reps: '1.5mi', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 10:30. Log your time on the PT Test page.' },
          { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '500m easy', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      rest(),
    ],
  },

  // ── P13: SAS Selection (British SAS-inspired) ────────────────────────────
  {
    id: 'p13',
    name: 'SAS Selection',
    // Built toward the published SAS Combat Fitness Test run standard: 2
    // miles under 18:00. Track your time on the PT Test page (SAS
    // Selection standard).
    description: 'Do you have what it takes to pass SAS Selection? A 12-week flagship program built around the real published Combat Fitness Test standard: a 2-mile run under 18:00, backed by the ruck-mile volume the Fan Dance demands.',
    level: 'advanced',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p13-e2', name: 'Pull-Up', sets: 5, reps: 10, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p13-e3', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 150, muscleGroup: 'legs' },
      { id: 'p13-e4', name: 'Farmer’s Carry', sets: 4, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
    ],
    schedule: [
      {
        label: 'Big Ruck',
        isRest: false,
        exercises: [
          { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '10 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Strength A',
        isRest: false,
        exercises: [
          { id: 'p13-e3', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 150, muscleGroup: 'legs' },
          { id: 'p13-e2', name: 'Pull-Up', sets: 5, reps: 10, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p13-e5', name: 'Overhead Press', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'shoulders' },
        ],
      },
      {
        label: 'Hill Run',
        isRest: false,
        exercises: [
          { id: 'p13-e6', name: 'Hill Sprint Intervals', sets: 8, reps: 1, restSeconds: 90, muscleGroup: 'cardio', isCardio: true },
          { id: 'p13-e12', name: '2-Mile Timed Run', sets: 1, reps: '2mi', restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Target: under 18:00 — the SAS Combat Fitness Test standard. Log your time on the PT Test page.' },
        ],
      },
      {
        label: 'Strength B',
        isRest: false,
        exercises: [
          { id: 'p13-e7', name: 'Deadlift', sets: 5, reps: 5, restSeconds: 150, muscleGroup: 'back' },
          { id: 'p13-e4', name: 'Farmer’s Carry', sets: 4, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
          { id: 'p13-e8', name: 'Weighted Dip', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
        ],
      },
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Bodyweight Endurance',
        isRest: false,
        exercises: [
          { id: 'p13-e9', name: 'Push-Up', sets: 5, reps: 25, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p13-e10', name: 'Sit-Up', sets: 5, reps: 25, restSeconds: 45, muscleGroup: 'core' },
          { id: 'p13-e11', name: 'Burpee', sets: 5, reps: 15, restSeconds: 60, muscleGroup: 'full-body' },
        ],
      },
      rest(),
    ],
  },

  // ── P14: PJ Conditioning (Air Force Pararescue-inspired) ─────────────────
  {
    id: 'p14',
    name: 'PJ Conditioning',
    // Built toward the published Air Force Pararescue (PJ) PAST standard:
    // 10 pull-ups. Track your number on the PT Test page (PJ Indoc Prep
    // standard).
    description: 'Do you have what it takes to be a PJ? A 10-week hybrid strength/endurance/swim program toward the real published PAST standard: 10 pull-ups, alongside the swim and ruck conditioning the full indoc demands.',
    level: 'advanced',
    goal: 'general',
    weeks: 10,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '800m', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p14-e2', name: 'Pull-Up', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p14-e3', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
      { id: 'p14-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
    ],
    schedule: [
      {
        label: 'Swim Conditioning',
        isRest: false,
        exercises: [
          { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '800m', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          { id: 'p14-e5', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Full Body Strength',
        isRest: false,
        exercises: [
          { id: 'p14-e3', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p14-e2', name: 'Pull-Up', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'back', notes: 'Build toward 10+ reps — the PAST standard.' },
          { id: 'p14-e6', name: 'Dumbbell Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
        ],
      },
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p14-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      {
        label: 'Interval Conditioning',
        isRest: false,
        exercises: [
          { id: 'p14-e7', name: 'Burpee', sets: 5, reps: 15, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p14-e8', name: 'Kettlebell Swing', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
        ],
      },
      {
        label: 'Swim + Core',
        isRest: false,
        exercises: [
          { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '600m', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          { id: 'p14-e9', name: 'Hanging Leg Raise', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Standard Test Day',
        isRest: false,
        exercises: [
          { id: 'p14-e10', name: 'Pull-Up Max Test', sets: 1, reps: 'AMRAP', restSeconds: 0, muscleGroup: 'back', notes: 'Target: 10+ reps — the PAST standard. Log your number on the PT Test page.' },
          { id: 'p14-e11', name: 'Steady-State Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        ],
      },
      rest(),
    ],
  },

  // ── P15: Burn Ops — 90-Day Fat Loss Protocol ──────────────────────────
  // Adapted from a user-supplied "Burn Ops" program doc that leaned on a
  // 1-meal-a-day / 1200kcal protocol and framed hunger/withdrawal symptoms
  // as things to push through — not safe to ship as-is. Kept everything
  // that WAS good: the 3-phase progressive structure (foundation ->
  // escalation -> full-send), the actual exercise programming (circuits ->
  // split routine -> giant sets/drop sets/HIIT), daily cardio, and the
  // military "mission" branding. Nutrition guidance in the description
  // points to the app's own calorie calculator (a real moderate deficit)
  // instead of the extreme-restriction protocol from the source doc.
  {
    id: 'p15',
    name: 'Burn Ops: 90-Day Fat Loss Protocol',
    description: 'A 90-day, 3-phase mission built to strip fat and build real conditioning — for men and women, home-friendly (dumbbells + bodyweight, no gym required).\n\nPhase 1 (Weeks 1-4): Foundation. Bodyweight circuits + daily cardio — build consistency and a real mind-muscle connection.\n\nPhase 2 (Weeks 5-7): Escalation. A structured push/pull/legs split with dumbbells — more volume, more intensity.\n\nWeek 8: Deload. A lighter recovery week — same movements, less volume — before the hardest block. Don\'t skip it, it\'s what makes Phase 3 sustainable instead of a burnout risk.\n\nPhase 3 (Weeks 9-13): Full Send. Giant sets, drop sets, and HIIT finishers — your hardest block, built on the base you already earned.\n\nPair this with a moderate calorie deficit (your Nutrition tab already calculates yours) and daily movement — that combo, not starvation, is what actually burns fat and keeps it off.\n\nProgress checkpoints: weigh in once a week, same day and time, and track the trend — not any single day. If your weight hasn\'t moved over 2 straight weeks, tighten your calorie target slightly or add 10-15 minutes to your daily cardio before changing anything else. And once your dumbbell exercises feel easy at the top of the rep range, add weight — the notes on each exercise tell you when.',
    level: 'beginner',
    goal: 'weight-loss',
    weeks: 13,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p15-e2', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p15-e3', name: 'Plank', sets: 3, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
      { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 45, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
      { id: 'p15-e5', name: 'Dumbbell Bench Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'chest' },
      { id: 'p15-e6', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
      { id: 'p15-e7', name: 'Goblet Squat', sets: 3, reps: 15, restSeconds: 75, muscleGroup: 'legs' },
      { id: 'p15-e8', name: 'Burpee', sets: 3, reps: 12, restSeconds: 45, muscleGroup: 'full-body' },
    ],
    // phases[0]'s full 7-day schedule doubles as the top-level `schedule`
    // fallback for any older code path that reads program.schedule directly
    // instead of going through phases (e.g. the program detail page's
    // weekly-training-day count) — this was previously truncated to just
    // 2 of the 7 days, making that count read "1 workout day" instead of 5.
    schedule: [
      { label: 'Full-Body Circuit A', isRest: false, exercises: [
        { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
        { id: 'p15-e2', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
        { id: 'p15-e3', name: 'Plank', sets: 3, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
        { id: 'p15-e9', name: 'Glute Bridge', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
        { id: 'p15-e10', name: 'Mountain Climbers', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
      ] },
      { label: 'Cardio + Core', isRest: false, exercises: [
        { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 45, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
        { id: 'p15-e3', name: 'Plank', sets: 3, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
        { id: 'p15-e11', name: 'Bicycle Crunch', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
      ] },
      { label: 'Full-Body Circuit B', isRest: false, exercises: [
        { id: 'p15-e12', name: 'Reverse Lunge', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
        { id: 'p15-e13', name: 'Incline Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
        { id: 'p15-e14', name: 'Superman', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'back' },
        { id: 'p15-e15', name: 'Side Plank', sets: 3, reps: '20s', restSeconds: 45, muscleGroup: 'core' },
        { id: 'p15-e16', name: 'Jumping Jacks', sets: 3, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30 },
      ] },
      rest(),
      { label: 'Full-Body Circuit C', isRest: false, exercises: [
        { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
        { id: 'p15-e2', name: 'Bodyweight Squat', sets: 3, reps: 18, restSeconds: 60, muscleGroup: 'legs' },
        { id: 'p15-e9', name: 'Glute Bridge', sets: 3, reps: 18, restSeconds: 45, muscleGroup: 'legs' },
        { id: 'p15-e10', name: 'Mountain Climbers', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
        { id: 'p15-e3', name: 'Plank', sets: 3, reps: '40s', restSeconds: 45, muscleGroup: 'core' },
      ] },
      { label: 'Cardio + Mobility', isRest: false, exercises: [
        { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 60, restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Follow with 5-10 min of light stretching.' },
      ] },
      rest(),
    ],
    phases: [
      {
        id: 'p15-ph1',
        label: 'Phase 1: Foundation',
        startWeek: 1,
        endWeek: 4,
        schedule: [
          { label: 'Full-Body Circuit A', isRest: false, exercises: [
            { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
            { id: 'p15-e2', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p15-e3', name: 'Plank', sets: 3, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
            { id: 'p15-e9', name: 'Glute Bridge', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Cardio + Core', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 45, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
            { id: 'p15-e3', name: 'Plank', sets: 3, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
            { id: 'p15-e11', name: 'Bicycle Crunch', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Full-Body Circuit B', isRest: false, exercises: [
            { id: 'p15-e12', name: 'Reverse Lunge', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p15-e13', name: 'Incline Push-Up', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest' },
            { id: 'p15-e14', name: 'Superman', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'back' },
            { id: 'p15-e15', name: 'Side Plank', sets: 3, reps: '20s', restSeconds: 45, muscleGroup: 'core' },
            { id: 'p15-e16', name: 'Jumping Jacks', sets: 3, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30 },
          ] },
          rest(),
          { label: 'Full-Body Circuit C', isRest: false, exercises: [
            { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
            { id: 'p15-e2', name: 'Bodyweight Squat', sets: 3, reps: 18, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p15-e9', name: 'Glute Bridge', sets: 3, reps: 18, restSeconds: 45, muscleGroup: 'legs' },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
            { id: 'p15-e3', name: 'Plank', sets: 3, reps: '40s', restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Cardio + Mobility', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 60, restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Follow with 5-10 min of light stretching.' },
          ] },
          rest(),
        ],
      },
      {
        id: 'p15-ph2',
        label: 'Phase 2: Escalation',
        startWeek: 5,
        endWeek: 7,
        schedule: [
          { label: 'Chest + Triceps + Core', isRest: false, exercises: [
            { id: 'p15-e5', name: 'Dumbbell Bench Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'chest', notes: 'Progressive overload: once you complete all 3 sets of 12 with good form, add weight next session.' },
            { id: 'p15-e17', name: 'Dumbbell Flye', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'chest', notes: 'Add weight once all sets hit 12 reps cleanly.' },
            { id: 'p15-e18', name: 'Tricep Dip', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms' },
            { id: 'p15-e3', name: 'Plank', sets: 3, reps: '45s', restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Back + Biceps + Core', isRest: false, exercises: [
            { id: 'p15-e6', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back', notes: 'Progressive overload: once you complete all 3 sets of 12 with good form, add weight next session.' },
            { id: 'p15-e19', name: 'Renegade Row', sets: 3, reps: 10, restSeconds: 60, muscleGroup: 'back' },
            { id: 'p15-e20', name: 'Dumbbell Bicep Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'arms', notes: 'Add weight once all sets hit 12 reps cleanly.' },
            { id: 'p15-e21', name: 'Russian Twist', sets: 3, reps: 20, restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Legs + Shoulders + Core', isRest: false, exercises: [
            { id: 'p15-e7', name: 'Goblet Squat', sets: 3, reps: 15, restSeconds: 75, muscleGroup: 'legs', notes: 'Progressive overload: once you complete all 3 sets of 15 with good form, add weight next session.' },
            { id: 'p15-e22', name: 'Dumbbell Romanian Deadlift', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'legs' },
            { id: 'p15-e23', name: 'Dumbbell Shoulder Press', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'shoulders', notes: 'Add weight once all sets hit 12 reps cleanly.' },
            { id: 'p15-e24', name: 'Lateral Raise', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'shoulders' },
          ] },
          { label: 'Cardio + Core', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk / Light Jog', sets: 1, reps: 45, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
            { id: 'p15-e25', name: 'Lying Leg Raise', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Full-Body Functional', isRest: false, exercises: [
            { id: 'p15-e8', name: 'Burpee', sets: 3, reps: 12, restSeconds: 45, muscleGroup: 'full-body' },
            { id: 'p15-e26', name: 'Dumbbell Swing', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'full-body', notes: 'Add weight once all sets hit 15 reps cleanly.' },
            { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'chest' },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Light Cardio + Mobility', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 30, restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Follow with 10 min of mobility work.' },
          ] },
          rest(),
        ],
      },
      // Deload — a single lighter week between the two escalating blocks.
      // Phase 2 -> Phase 3 goes straight from moderate dumbbell training
      // into giant sets/drop sets/HIIT at 6 days/week; without a break
      // between them, someone who was doing bodyweight circuits a month
      // earlier is at real risk of burnout or injury before Phase 3 even
      // starts. Same movement patterns, ~60% of the volume, so it still
      // feels like training, not a dead week.
      {
        id: 'p15-deload',
        label: 'Deload / Recovery Week',
        startWeek: 8,
        endWeek: 8,
        schedule: [
          { label: 'Light Full-Body', isRest: false, exercises: [
            { id: 'p15-e5', name: 'Dumbbell Bench Press', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'chest', notes: 'Deload week — lighter weight, focus on form and recovery.' },
            { id: 'p15-e7', name: 'Goblet Squat', sets: 2, reps: 12, restSeconds: 90, muscleGroup: 'legs' },
            { id: 'p15-e3', name: 'Plank', sets: 2, reps: '30s', restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Light Cardio', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 40, restSeconds: 0, muscleGroup: 'cardio', isCardio: true },
          ] },
          { label: 'Light Full-Body', isRest: false, exercises: [
            { id: 'p15-e6', name: 'Dumbbell Row', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'back', notes: 'Deload week — lighter weight, focus on form and recovery.' },
            { id: 'p15-e23', name: 'Dumbbell Shoulder Press', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'shoulders' },
            { id: 'p15-e9', name: 'Glute Bridge', sets: 2, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
          ] },
          rest(),
          { label: 'Light Cardio + Mobility', isRest: false, exercises: [
            { id: 'p15-e4', name: 'Brisk Walk', sets: 1, reps: 30, restSeconds: 0, muscleGroup: 'cardio', isCardio: true, notes: 'Follow with 10-15 min of stretching or foam rolling.' },
          ] },
          rest(),
          rest(),
        ],
      },
      {
        id: 'p15-ph3',
        label: 'Phase 3: Full Send',
        startWeek: 9,
        endWeek: 13,
        schedule: [
          { label: 'Chest + HIIT', isRest: false, exercises: [
            { id: 'p15-e5', name: 'Dumbbell Bench Press', sets: 3, reps: 10, restSeconds: 20, muscleGroup: 'chest', notes: 'Giant set — go straight into the next exercise.' },
            { id: 'p15-e27', name: 'Incline Dumbbell Press', sets: 3, reps: 10, restSeconds: 20, muscleGroup: 'chest', notes: 'Giant set, part 2.' },
            { id: 'p15-e1', name: 'Push-Up', sets: 3, reps: 'to failure', restSeconds: 90, muscleGroup: 'chest', notes: 'Giant set, part 3 — then rest.' },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30, notes: 'HIIT finisher.' },
            { id: 'p15-e8', name: 'Burpee', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'full-body', isCardio: true, cardioDurationSeconds: 30 },
          ] },
          { label: 'Back + HIIT', isRest: false, exercises: [
            { id: 'p15-e6', name: 'Dumbbell Row', sets: 3, reps: 10, restSeconds: 20, muscleGroup: 'back', notes: 'Giant set — go straight into the next exercise.' },
            { id: 'p15-e19', name: 'Renegade Row', sets: 3, reps: 10, restSeconds: 20, muscleGroup: 'back', notes: 'Giant set, part 2.' },
            { id: 'p15-e14', name: 'Superman', sets: 3, reps: 15, restSeconds: 90, muscleGroup: 'back', notes: 'Giant set, part 3 — then rest.' },
            { id: 'p15-e28', name: 'Jumping Lunges', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30, notes: 'HIIT finisher.' },
            { id: 'p15-e29', name: 'High Knees', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30 },
          ] },
          { label: 'Legs + Core + HIIT', isRest: false, exercises: [
            { id: 'p15-e7', name: 'Goblet Squat', sets: 3, reps: 12, restSeconds: 20, muscleGroup: 'legs', notes: 'Giant set — go straight into the next exercise.' },
            { id: 'p15-e30', name: 'Walking Lunge', sets: 3, reps: 12, restSeconds: 20, muscleGroup: 'legs', notes: 'Giant set, part 2.' },
            { id: 'p15-e31', name: 'Jump Squat', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'legs', notes: 'Giant set, part 3 — then rest.' },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30, notes: 'HIIT finisher.' },
            { id: 'p15-e8', name: 'Burpee', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'full-body', isCardio: true, cardioDurationSeconds: 30 },
          ] },
          { label: 'Shoulders + Arms + HIIT', isRest: false, exercises: [
            { id: 'p15-e23', name: 'Dumbbell Shoulder Press', sets: 3, reps: 10, restSeconds: 20, muscleGroup: 'shoulders', notes: 'Giant set — go straight into the next exercise.' },
            { id: 'p15-e24', name: 'Lateral Raise', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Giant set, part 2 — then rest.' },
            { id: 'p15-e20', name: 'Dumbbell Bicep Curl', sets: 3, reps: 12, restSeconds: 15, muscleGroup: 'arms', notes: 'Superset — go straight into the next exercise.' },
            { id: 'p15-e18', name: 'Tricep Dip', sets: 3, reps: 12, restSeconds: 90, muscleGroup: 'arms', notes: 'Superset, part 2 — then rest.' },
            { id: 'p15-e32', name: 'Plank Jacks', sets: 4, reps: 1, restSeconds: 30, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30, notes: 'HIIT finisher.' },
          ] },
          { label: 'Full-Body HIIT Finisher', isRest: false, exercises: [
            { id: 'p15-e8', name: 'Burpee', sets: 4, reps: 1, restSeconds: 15, muscleGroup: 'full-body', isCardio: true, cardioDurationSeconds: 30, notes: 'Tabata-style — 4 rounds of the whole circuit.' },
            { id: 'p15-e31', name: 'Jump Squat', sets: 4, reps: 1, restSeconds: 15, muscleGroup: 'legs', isCardio: true, cardioDurationSeconds: 30 },
            { id: 'p15-e1', name: 'Push-Up', sets: 4, reps: 1, restSeconds: 15, muscleGroup: 'chest', isCardio: true, cardioDurationSeconds: 30 },
            { id: 'p15-e10', name: 'Mountain Climbers', sets: 4, reps: 1, restSeconds: 90, muscleGroup: 'core', isCardio: true, cardioDurationSeconds: 30 },
            { id: 'p15-e33', name: 'Weighted Plank', sets: 3, reps: '45s', restSeconds: 45, muscleGroup: 'core' },
          ] },
          { label: 'Sprints + Core', isRest: false, exercises: [
            { id: 'p15-e34', name: 'Sprint Intervals', sets: 10, reps: 1, restSeconds: 60, muscleGroup: 'cardio', isCardio: true, cardioDurationSeconds: 30, notes: 'All-out for 30 seconds each interval.' },
            { id: 'p15-e33', name: 'Weighted Plank', sets: 3, reps: '60s', restSeconds: 45, muscleGroup: 'core' },
            { id: 'p15-e15', name: 'Side Plank', sets: 3, reps: '45s', restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
        ],
      },
    ],
  },
  // ── P16: Alpha Bulk — 90-Day Muscle Mass Protocol ─────────────────────
  // Adapted from a user-supplied hypertrophy doc built around a specific,
  // deliberate philosophy: LOW volume, HIGH intensity, only 3 full-body-
  // split sessions a week — designed for someone also training combat
  // sports 2x/week and needing real recovery capacity left over. Every
  // phase below preserves that identity rather than defaulting to the
  // generic "add more sets each phase" progression model — the source
  // material is explicit that piling on volume is the wrong lever here.
  // Progression instead comes from proximity to true failure, exercise
  // selection (more unilateral/technical work as phases advance), and one
  // intensity technique (a single drop set) introduced only in Phase 3 —
  // never from ballooning total sets, which would undermine the whole
  // point of the program.
  {
    id: 'p16',
    name: 'Alpha Bulk: 90-Day Muscle Mass Protocol',
    description: 'A 90-day, 3-phase hypertrophy program built for maximum muscle growth from minimum time in the gym — 3 full-body-split sessions a week, deliberately low volume, so you still have the recovery capacity for martial arts or combat sports training at least twice weekly.\n\nThe method: mechanical tension — not endless sets — is what actually drives growth. Research on the "stimulating reps" model shows only the last ~5 reps before failure meaningfully trigger hypertrophy, which is why every set here is short, close to true failure, and performed at a strict 3-0-3-0 tempo (3 seconds down, no pause, 3 seconds up, no pause). At 8 reps that\'s ~48 seconds of time under tension per set — right in the 40-60 second window where muscle growth is maximized. Fewer, harder sets beat more, easier ones, and they leave far less fatigue to dig out of before your next combat session.\n\nPhase 1 (Weeks 1-4): Foundation. Learn the tempo, build the mind-muscle connection, establish your working weights.\n\nPhase 2 (Weeks 5-7): Escalation. New exercise selection with more single-arm/unilateral work, same low volume, pushed closer to true failure on every set.\n\nWeek 8: Deload. Same movement patterns, roughly half the effort — this is what makes Phase 3 sustainable instead of a burnout risk. Don\'t skip it.\n\nPhase 3 (Weeks 9-13): Peak Intensity. Train the last set of key lifts to true failure, with one drop set worked in on the hardest day — still only 3 sessions a week, still room for your combat training.\n\nForm notes: engage the target muscle before you move, keep tension constant through the whole rep, and never hold your breath through a slow rep — instead take several short, controlled "puff" inhales and exhales through each rep (Lamaze-style breathing), which keeps you stable and prevents you from leaning on momentum as you fatigue. Rest 2-3 minutes between compound lifts (squats, presses, rows, deadlifts), 1.5-2 minutes between isolation work — recovery between sets is what keeps every rep high-quality, not wasted time.',
    level: 'intermediate',
    goal: 'hypertrophy',
    weeks: 13,
    daysPerWeek: 3,
    isPublic: true,
    isPremium: true,
    createdBy: 'system',
    exercises: [
      { id: 'p16-e1', name: 'Slight Incline Smith Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: '3-0-3-0 tempo. Engage the chest before you unrack — last 2-3 reps should be genuinely hard.' },
      { id: 'p16-e2', name: 'Squat (Free Weight or Smith)', sets: 2, reps: 10, restSeconds: 150, muscleGroup: 'legs', notes: 'Chest up, knees tracking over toes. 3-0-3-0 tempo — no bouncing at the bottom.' },
      { id: 'p16-e3', name: 'Lat Pulldown', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the chest, squeeze the lats at the bottom, control the return.' },
      { id: 'p16-e4', name: 'Seated Machine Shoulder Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'shoulders', notes: 'Core tight, avoid locking out the elbows at the top.' },
      { id: 'p16-e5', name: 'Triceps Rope Pushdowns', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Elbows stay pinned to your sides the whole set.' },
      { id: 'p16-e6', name: 'Lying Hamstring Curl', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Squeeze the hamstrings hard at the top, lower under full control.' },
      { id: 'p16-e7', name: 'Dual Dumbbell Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the waist, lead with the elbow, keep the back flat.' },
      { id: 'p16-e8', name: 'Seated Dumbbell Curls (One Arm at a Time)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Full stretch at the bottom, hard squeeze at the top.' },
      { id: 'p16-e9', name: 'Seated Calf Raise', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
    ],
    // phases[0]'s full 7-day schedule doubles as the top-level `schedule`
    // fallback for any older code path that reads program.schedule
    // directly instead of going through phases — same reasoning as P15.
    schedule: [
      { label: 'Chest, Shoulders, Triceps, Abs', isRest: false, exercises: [
        { id: 'p16-e1', name: 'Slight Incline Smith Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: '3-0-3-0 tempo (3s down, 3s up, no pauses). Engage the chest before you unrack.' },
        { id: 'p16-e11', name: 'Dips (Chest Focus)', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: 'Lean forward to bias the chest. Elbows to ~90°, don\'t lock out at the top.' },
        { id: 'p16-e12', name: 'Standing Dumbbell Lateral Raises', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Raise to shoulder height, slight bend in the elbow, no swinging.' },
        { id: 'p16-e4', name: 'Seated Machine Shoulder Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'shoulders', notes: 'Core tight, avoid locking out at the top.' },
        { id: 'p16-e13', name: 'Lying Dumbbell Triceps Extensions', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Lower behind the head under control, extend back to full lockout.' },
        { id: 'p16-e5', name: 'Triceps Rope Pushdowns', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Elbows pinned to your sides the whole set.' },
        { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
      ] },
      rest(),
      { label: 'Legs (Quads, Hamstrings, Glutes, Calves)', isRest: false, exercises: [
        { id: 'p16-e6', name: 'Lying Hamstring Curl', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Squeeze at the top, lower under full control.' },
        { id: 'p16-e2', name: 'Squat (Free Weight or Smith)', sets: 2, reps: 10, restSeconds: 150, muscleGroup: 'legs', notes: 'Chest up, knees tracking over toes, no bouncing at the bottom.' },
        { id: 'p16-e14', name: 'Leg Extension', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs', notes: 'Pause and squeeze the quads at the top.' },
        { id: 'p16-e15', name: 'Dumbbell Stiff-Leg Deadlift', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Hinge at the hips, slight knee bend, lower until you feel the hamstring stretch.' },
        { id: 'p16-e16', name: 'Abductor Machine', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
        { id: 'p16-e9', name: 'Seated Calf Raise', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
        { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
      ] },
      rest(),
      { label: 'Back, Biceps, Rear Delts, Abs', isRest: false, exercises: [
        { id: 'p16-e3', name: 'Lat Pulldown', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the chest, squeeze the lats, control the return.' },
        { id: 'p16-e7', name: 'Dual Dumbbell Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the waist, lead with the elbow, keep the back flat.' },
        { id: 'p16-e17', name: 'Mid-Back Row Machine', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back' },
        { id: 'p16-e18', name: 'Reverse Pec Deck (Rear Delts)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Squeeze the rear delts, slight bend in the elbows throughout.' },
        { id: 'p16-e8', name: 'Seated Dumbbell Curls (One Arm at a Time)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Full stretch at the bottom, hard squeeze at the top.' },
        { id: 'p16-e19', name: 'Hammer Dumbbell Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
        { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
      ] },
      rest(),
      rest(),
    ],
    phases: [
      {
        id: 'p16-ph1',
        label: 'Phase 1: Foundation',
        startWeek: 1,
        endWeek: 4,
        schedule: [
          { label: 'Chest, Shoulders, Triceps, Abs', isRest: false, exercises: [
            { id: 'p16-e1', name: 'Slight Incline Smith Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: '3-0-3-0 tempo (3s down, 3s up, no pauses). Engage the chest before you unrack.' },
            { id: 'p16-e11', name: 'Dips (Chest Focus)', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: 'Lean forward to bias the chest. Elbows to ~90°, don\'t lock out at the top.' },
            { id: 'p16-e12', name: 'Standing Dumbbell Lateral Raises', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Raise to shoulder height, slight bend in the elbow, no swinging.' },
            { id: 'p16-e4', name: 'Seated Machine Shoulder Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'shoulders', notes: 'Core tight, avoid locking out at the top.' },
            { id: 'p16-e13', name: 'Lying Dumbbell Triceps Extensions', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Lower behind the head under control, extend back to full lockout.' },
            { id: 'p16-e5', name: 'Triceps Rope Pushdowns', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Elbows pinned to your sides the whole set.' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Legs (Quads, Hamstrings, Glutes, Calves)', isRest: false, exercises: [
            { id: 'p16-e6', name: 'Lying Hamstring Curl', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Squeeze at the top, lower under full control.' },
            { id: 'p16-e2', name: 'Squat (Free Weight or Smith)', sets: 2, reps: 10, restSeconds: 150, muscleGroup: 'legs', notes: 'Chest up, knees tracking over toes, no bouncing at the bottom.' },
            { id: 'p16-e14', name: 'Leg Extension', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs', notes: 'Pause and squeeze the quads at the top.' },
            { id: 'p16-e15', name: 'Dumbbell Stiff-Leg Deadlift', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Hinge at the hips, slight knee bend, lower until you feel the hamstring stretch.' },
            { id: 'p16-e16', name: 'Abductor Machine', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
            { id: 'p16-e9', name: 'Seated Calf Raise', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Back, Biceps, Rear Delts, Abs', isRest: false, exercises: [
            { id: 'p16-e3', name: 'Lat Pulldown', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the chest, squeeze the lats, control the return.' },
            { id: 'p16-e7', name: 'Dual Dumbbell Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Pull to the waist, lead with the elbow, keep the back flat.' },
            { id: 'p16-e17', name: 'Mid-Back Row Machine', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back' },
            { id: 'p16-e18', name: 'Reverse Pec Deck (Rear Delts)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Squeeze the rear delts, slight bend in the elbows throughout.' },
            { id: 'p16-e8', name: 'Seated Dumbbell Curls (One Arm at a Time)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Full stretch at the bottom, hard squeeze at the top.' },
            { id: 'p16-e19', name: 'Hammer Dumbbell Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          rest(),
        ],
      },
      {
        id: 'p16-ph2',
        label: 'Phase 2: Escalation',
        startWeek: 5,
        endWeek: 7,
        schedule: [
          { label: 'Chest, Shoulders, Triceps, Abs', isRest: false, exercises: [
            { id: 'p16-e42', name: 'Chest Machine Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'chest', notes: 'Adjust the seat so the handles align with mid-chest. Same tempo, heavier load than Phase 1 — the last 2 reps should be genuinely hard.' },
            { id: 'p16-e43', name: 'Cable Flyes', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'chest', notes: 'Pulleys at chest height, slight bend in the elbows, bring hands together in an arc.' },
            { id: 'p16-e44', name: 'Smith Shoulder Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'shoulders' },
            { id: 'p16-e45', name: 'JM Press', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Elbows stay close as you lower the bar toward your upper chest.' },
            { id: 'p16-e46', name: 'Single Arm Cable Lateral Raises', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Unilateral — constant tension on the delt, avoid leaning to the side.' },
            { id: 'p16-e23', name: 'Single-Arm Cable Triceps Extensions', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Unilateral — focus on full extension each rep.' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Legs (Quads, Hamstrings, Glutes, Calves)', isRest: false, exercises: [
            { id: 'p16-e24', name: 'Seated Hamstring Curl', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs' },
            { id: 'p16-e41', name: 'Leg Press', sets: 2, reps: 10, restSeconds: 150, muscleGroup: 'legs' },
            { id: 'p16-e47', name: 'Split Squats', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: '10 reps per leg — unilateral work builds stability the bilateral lifts can\'t.' },
            { id: 'p16-e14', name: 'Leg Extension', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
            { id: 'p16-e26', name: 'Standing Calf Raises', sets: 2, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p16-e48', name: 'Toe Press on Leg Press Machine', sets: 2, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Back, Biceps, Rear Delts, Abs', isRest: false, exercises: [
            { id: 'p16-e49', name: 'Wide-Grip Lat Pulldown', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back' },
            { id: 'p16-e50', name: 'Romanian Deadlift', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'legs', notes: 'Knees slightly bent, hinge at the hips, engage glutes and hamstrings to stand.' },
            { id: 'p16-e51', name: 'Seated Cable Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back', notes: 'Knees slightly bent, pull to the torso, squeeze the shoulder blades together.' },
            { id: 'p16-e52', name: 'High Cable Rear Delt Flyes', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders', notes: 'Pulleys at head height, pull arms outward in a cross, slight bend in the elbows.' },
            { id: 'p16-e53', name: 'Barbell Bicep Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
            { id: 'p16-e19', name: 'Hammer Dumbbell Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          rest(),
        ],
      },
      // Deload — same movement patterns as Phase 1, roughly half the
      // effort. Going straight from Phase 2 into training the last set of
      // every lift to true failure (Phase 3) without a break is a real
      // burnout/injury risk, especially for someone also training combat
      // sports on top of this. Same logic as P15's deload week.
      {
        id: 'p16-deload',
        label: 'Deload / Recovery Week',
        startWeek: 8,
        endWeek: 8,
        schedule: [
          { label: 'Light Upper Body', isRest: false, exercises: [
            { id: 'p16-e1', name: 'Slight Incline Smith Press', sets: 1, reps: 10, restSeconds: 120, muscleGroup: 'chest', notes: 'Deload week — lighter weight, focus purely on tempo and form.' },
            { id: 'p16-e4', name: 'Seated Machine Shoulder Press', sets: 1, reps: 10, restSeconds: 120, muscleGroup: 'shoulders' },
            { id: 'p16-e5', name: 'Triceps Rope Pushdowns', sets: 1, reps: 10, restSeconds: 60, muscleGroup: 'arms' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 2, reps: 12, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Light Legs', isRest: false, exercises: [
            { id: 'p16-e2', name: 'Squat (Free Weight or Smith)', sets: 1, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: 'Deload week — lighter weight, focus purely on tempo and form.' },
            { id: 'p16-e14', name: 'Leg Extension', sets: 1, reps: 10, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p16-e9', name: 'Seated Calf Raise', sets: 2, reps: 12, restSeconds: 45, muscleGroup: 'legs' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 2, reps: 12, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Light Back & Arms', isRest: false, exercises: [
            { id: 'p16-e3', name: 'Lat Pulldown', sets: 1, reps: 10, restSeconds: 120, muscleGroup: 'back', notes: 'Deload week — lighter weight, focus purely on tempo and form.' },
            { id: 'p16-e8', name: 'Seated Dumbbell Curls (One Arm at a Time)', sets: 1, reps: 10, restSeconds: 60, muscleGroup: 'arms' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 2, reps: 12, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          rest(),
        ],
      },
      {
        id: 'p16-ph3',
        label: 'Phase 3: Peak Intensity',
        startWeek: 9,
        endWeek: 13,
        schedule: [
          { label: 'Chest, Shoulders, Triceps, Abs', isRest: false, exercises: [
            { id: 'p16-e32', name: 'Barbell Bench Press', sets: 2, reps: 8, restSeconds: 180, muscleGroup: 'chest', notes: 'Take the last set to true failure — the last 2-3 reps should feel genuinely maximal.' },
            { id: 'p16-e4', name: 'Seated Machine Shoulder Press', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'shoulders' },
            { id: 'p16-e33', name: 'Incline Dumbbell Flyes', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'chest', notes: 'Slight bend in the elbows, full stretch at the bottom.' },
            { id: 'p16-e34', name: 'Cable Lateral Raises', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders' },
            { id: 'p16-e35', name: 'Overhead Triceps Extension', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
            { id: 'p16-e36', name: 'Triceps Dips', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'arms', notes: 'Final set: drop set — on failure, reduce assistance/weight and continue to a second failure point.' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Legs (Quads, Hamstrings, Glutes, Calves)', isRest: false, exercises: [
            { id: 'p16-e37', name: 'Front Squat', sets: 2, reps: 10, restSeconds: 180, muscleGroup: 'legs', notes: 'The hardest lift of the week — prioritize depth and control over the weight on the bar.' },
            { id: 'p16-e38', name: 'Walking Lunges', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: '10 reps per leg.' },
            { id: 'p16-e39', name: 'Bulgarian Split Squat', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs', notes: '10 reps per leg — back knee nearly touches the ground.' },
            { id: 'p16-e40', name: 'Seated Leg Curl', sets: 2, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
            { id: 'p16-e41', name: 'Leg Press', sets: 2, reps: 10, restSeconds: 120, muscleGroup: 'legs' },
            { id: 'p16-e26', name: 'Standing Calf Raises', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'legs' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          { label: 'Back, Biceps, Rear Delts, Abs', isRest: false, exercises: [
            { id: 'p16-e27', name: 'Pull-Ups (Assisted if needed)', sets: 2, reps: 8, restSeconds: 150, muscleGroup: 'back', notes: 'Take the last set as close to failure as clean form allows.' },
            { id: 'p16-e28', name: 'One-Arm Dumbbell Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back' },
            { id: 'p16-e29', name: 'T-Bar Row', sets: 2, reps: 8, restSeconds: 120, muscleGroup: 'back' },
            { id: 'p16-e18', name: 'Reverse Pec Deck (Rear Delts)', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'shoulders' },
            { id: 'p16-e30', name: 'EZ Bar Preacher Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms' },
            { id: 'p16-e31', name: 'Concentration Curls', sets: 2, reps: 8, restSeconds: 90, muscleGroup: 'arms', notes: 'Final set: push to true failure — slow and controlled, no swinging even as it gets hard.' },
            { id: 'p16-e10', name: 'Abs — Exercise of Choice', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'core' },
          ] },
          rest(),
          rest(),
        ],
      },
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
 * hard include/exclude programs — every program is appropriate for any
 * athlete; biometrics only matter for calorie targets (handled separately)
 * and for calibrating starting loads once training, not for which plan gets
 * picked. `sex` and `hasLimitations` are optional soft signals only: a
 * gender-targeted program gets a small nudge for a matching user, and
 * programs flagged as physically demanding get a small penalty when the
 * user has reported an injury/medical limitation — nudges, never exclusions,
 * so a real coach isn't overridden by a single onboarding checkbox.
 */
// Programs don't carry an explicit equipment tag, so this estimates the
// heaviest equipment tier a program actually requires by scanning its own
// exercise names — 'barbell' implies a full gym/rack, kettlebell/dumbbell
// implies at-home free weights are enough, anything else is bodyweight-only.
// Used only as a soft nudge against a user's stated equipment access, same
// spirit as the sex/limitations signals above: never a hard exclusion.
const EQUIPMENT_RANK: Record<string, number> = { minimal: 0, home: 1, 'full-gym': 2 };

function estimateEquipmentTier(p: Program): 'minimal' | 'home' | 'full-gym' {
  const names = p.exercises.map((e) => e.name.toLowerCase()).join(' | ');
  if (/barbell/.test(names)) return 'full-gym';
  if (/kettlebell|dumbbell/.test(names)) return 'home';
  return 'minimal';
}

export function pickBestProgram(
  pool: Program[],
  goal: string,
  experience: string,
  trainingDays: number,
  sex?: string,
  hasLimitations?: boolean,
  equipment?: string,
  // Weeks needed to reach the user's chosen goal weight at a safe rate
  // (see estimateWeightGoalTimeline in lib/tdee.ts) — a program whose
  // total duration is wildly shorter or longer than that timeline is a
  // worse fit even if goal/level/days all match, e.g. a 4-week program for
  // someone whose weight goal realistically needs 6 months. Capped at 10
  // points (same ceiling as the goal-category match) so it's a real factor
  // without swamping every other signal.
  estimatedWeeksToGoal?: number
): Program | null {
  if (pool.length === 0) return null;
  const targetGoal = GOAL_TO_PROGRAM_GOAL[goal] ?? goal;
  const levelRank: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  const userEquipmentRank = equipment ? EQUIPMENT_RANK[equipment] : undefined;

  const scored = pool.map((p) => {
    let score = 0;
    if (p.goal === targetGoal) score += 10;
    else if (p.goal === 'general') score += 4; // general programs are a reasonable fallback for any goal
    const levelGap = Math.abs((levelRank[p.level] ?? 1) - (levelRank[experience] ?? 1));
    score += levelGap === 0 ? 6 : levelGap === 1 ? 2 : 0;
    score -= Math.abs(p.daysPerWeek - trainingDays);

    if (sex && p.targetGender && p.targetGender !== 'anyone') {
      score += p.targetGender === sex ? 2 : -3;
    }
    if (hasLimitations) {
      score -= p.level === 'advanced' ? 4 : p.level === 'intermediate' ? 1 : 0;
    }
    if (userEquipmentRank !== undefined) {
      const programNeedRank = EQUIPMENT_RANK[estimateEquipmentTier(p)];
      // Only penalize when the program needs MORE equipment than the user
      // has access to — never penalize a simple bodyweight program for
      // someone with a full gym, that's still a perfectly valid match.
      if (programNeedRank > userEquipmentRank) score -= 5 * (programNeedRank - userEquipmentRank);
    }
    if (estimatedWeeksToGoal && estimatedWeeksToGoal > 0) {
      score -= Math.min(10, Math.abs(p.weeks - estimatedWeeksToGoal) * 0.3);
    }

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
 * Returns the 7-day weekly template that applies to a given (1-indexed)
 * week number of a program. If the program defines `phases` (week-ranged
 * blocks — see ProgramPhase), picks whichever phase's range covers that
 * week, falling back to the last defined phase once the program runs
 * longer than its phases cover (e.g. a maintenance phase left undefined
 * past week 12). Programs with no phases just use the single top-level
 * `schedule` for every week, exactly as before phases existed.
 */
export function getScheduleForWeek(program: Program, weekNumber: number): ProgramDay[] | undefined {
  if (program.phases && program.phases.length > 0) {
    const sorted = [...program.phases].sort((a, b) => a.startWeek - b.startWeek);
    const match = sorted.find((p) => weekNumber >= p.startWeek && weekNumber <= p.endWeek);
    return (match ?? sorted[sorted.length - 1]).schedule;
  }
  return program.schedule;
}

/**
 * Returns the ProgramDay for the current user based on days since enrollment.
 * Falls back to day-of-week logic for legacy users without programStartDate.
 */
export function getProgramDayForUser(
  program: Program,
  programStartDate?: string
): ProgramDay | null {
  if (!program.schedule?.length && !program.phases?.length) return null;

  if (programStartDate) {
    const start = new Date(programStartDate);
    const dayIndex = Math.floor((Date.now() - start.getTime()) / 86400000);
    return getProgramDayForDow(program, dayIndex);
  }
  // fallback to DOW for existing users without programStartDate
  return getProgramDayForDow(program, (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })());
}

/**
 * Returns the ProgramDay for a given absolute day index since enrollment
 * (not day-of-week — despite the name, callers pass a running count of
 * training days/sessions), resolving through phases first if the program
 * has them, then cycling within that week's 7-day template.
 */
export function getProgramDayForDow(program: Program, dow: number): ProgramDay | null {
  const weekNumber = Math.floor(dow / 7) + 1;
  const schedule = getScheduleForWeek(program, weekNumber);
  if (!schedule || schedule.length === 0) {
    if (program.exercises.length === 0) return null;
    // Flat exercise list — treat every day as a training day
    return { label: 'Training', isRest: false, exercises: program.exercises };
  }
  return schedule[dow % schedule.length] ?? null;
}

/**
 * Total number of TRAINING days (rest slots excluded) across a program's
 * full length — phase-aware, so a program whose later phases train more or
 * fewer days per week is counted correctly instead of approximated by
 * `weeks × daysPerWeek`. Falls back to that approximation only when the
 * program has no schedule at all.
 */
export function getTotalTrainingDays(program: Program): number {
  const weeks = Math.max(1, program.weeks || 1);
  if (!program.schedule?.length && !program.phases?.length) {
    return weeks * (program.daysPerWeek || 1);
  }
  let total = 0;
  for (let w = 1; w <= weeks; w++) {
    const schedule = getScheduleForWeek(program, w);
    total += schedule?.filter((d) => !d.isRest).length ?? 0;
  }
  return Math.max(1, total);
}

/**
 * How many TRAINING slots fall in [0..lastSlotIndex] inclusive — converts a
 * slot-based progress pointer (which counts rest days too) into an honest
 * "sessions completed" count. Phase-aware for the same reason as above.
 */
export function countTrainingSlotsThrough(program: Program, lastSlotIndex: number): number {
  if (lastSlotIndex < 0) return 0;
  if (!program.schedule?.length && !program.phases?.length) {
    // Flat-exercise programs treat every slot as a training day
    return lastSlotIndex + 1;
  }
  let count = 0;
  for (let i = 0; i <= lastSlotIndex; i++) {
    const day = getProgramDayForDow(program, i);
    if (day && !day.isRest) count++;
  }
  return count;
}

export interface NextSession {
  /** Absolute slot index to pass to the workout session as `dow`. */
  index: number;
  day: ProgramDay;
  /** True when today should be displayed (and respected) as a rest day. */
  isRestToday: boolean;
}

/**
 * THE single source of truth for "what should this user do next" — used by
 * the dashboard card, the training list, and the program detail page so
 * they can never disagree.
 *
 * Fixes the rest-day deadlock: the progress pointer only ever advances when
 * a workout is COMPLETED, but rest slots can't be completed — so before
 * this, a pointer that landed on a rest slot stayed there forever and every
 * screen showed "Rest day" for the rest of time. The rule now:
 *
 *   - If the user trained YESTERDAY and the next slot is a rest day, today
 *     genuinely is their rest day — show it as such, no workout offered.
 *   - Otherwise (they last trained 2+ days ago, or never), rest slots are
 *     considered already-served by the time away: skip forward to the next
 *     training slot so there is always a workout to start.
 *
 * Completing that skipped-ahead slot moves `lastCompletedDayIndex` past the
 * rest slots naturally, so the pointer can never wedge on one. A full week
 * of rest slots (pathological admin data) is bounded and falls back to
 * showing the rest day rather than looping.
 */
export function getNextSession(
  program: Program,
  lastCompletedDayIndex: number,
  lastWorkoutDate?: string,
): NextSession | null {
  const start = lastCompletedDayIndex + 1;
  const first = getProgramDayForDow(program, start);
  if (!first) return null;

  if (!first.isRest) return { index: start, day: first, isRestToday: false };

  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE');
  const today = new Date().toLocaleDateString('sv-SE');
  // Trained yesterday (or somehow already today) → this rest day is current,
  // honor it. Anything older and the rest has already happened in real time.
  if (lastWorkoutDate === yesterday || lastWorkoutDate === today) {
    return { index: start, day: first, isRestToday: true };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const day = getProgramDayForDow(program, start + offset);
    if (day && !day.isRest) return { index: start + offset, day, isRestToday: false };
  }
  // Entire week is rest slots — show the rest day rather than spin
  return { index: start, day: first, isRestToday: true };
}
