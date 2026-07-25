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
    description: 'Your first step toward elite fitness, inspired by Royal Marines Commando training. Builds the base conditioning and functional strength every elite unit starts with.',
    level: 'beginner',
    goal: 'weight-loss',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p5-e1', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p5-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p5-e3', name: 'Brisk Walk / Jog', sets: 1, reps: '20 min', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p5-e4', name: 'Plank', sets: 3, reps: 30, restSeconds: 45, muscleGroup: 'core' },
    ],
    schedule: [
      {
        label: 'Fireteam Fitness Test',
        isRest: false,
        exercises: [
          { id: 'p5-e1', name: 'Bodyweight Squat', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p5-e2', name: 'Push-Up', sets: 3, reps: 10, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p5-e5', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'back' },
          { id: 'p5-e6', name: 'Plank', sets: 3, reps: 30, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Endurance March',
        isRest: false,
        exercises: [
          { id: 'p5-e3', name: 'Brisk Walk / Jog', sets: 1, reps: '25 min', restSeconds: 0, muscleGroup: 'cardio' },
          { id: 'p5-e7', name: 'Walking Lunge', sets: 3, reps: 16, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p5-e8', name: 'Bodyweight Glute Bridge', sets: 3, reps: 15, restSeconds: 45, muscleGroup: 'legs' },
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
        label: 'Full Body Conditioning',
        isRest: false,
        exercises: [
          { id: 'p5-e10', name: 'Dumbbell Goblet Squat', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'legs' },
          { id: 'p5-e5', name: 'Dumbbell Row', sets: 3, reps: 12, restSeconds: 75, muscleGroup: 'back' },
          { id: 'p5-e11', name: 'Dumbbell Shoulder Press', sets: 3, reps: 10, restSeconds: 75, muscleGroup: 'shoulders' },
          { id: 'p5-e3', name: 'Brisk Walk / Jog', sets: 1, reps: '15 min', restSeconds: 0, muscleGroup: 'cardio' },
        ],
      },
      rest(),
    ],
  },

  // ── P6: Ranger Assessment (US Army Rangers-inspired) ─────────────────────
  {
    id: 'p6',
    name: 'Ranger Assessment',
    description: 'Weighted rucks, bodyweight circuits, and tactical strength — inspired by the standard Army Ranger prepares for selection with.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 10,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p6-e1', name: 'Weighted Ruck March', sets: 1, reps: '4 miles', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p6-e2', name: 'Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p6-e3', name: 'Front Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
      { id: 'p6-e4', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
    ],
    schedule: [
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p6-e1', name: 'Weighted Ruck March', sets: 1, reps: '4 miles', restSeconds: 0, muscleGroup: 'cardio' },
          { id: 'p6-e5', name: 'Bodyweight Lunge', sets: 3, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
        ],
      },
      {
        label: 'Tactical Strength A',
        isRest: false,
        exercises: [
          { id: 'p6-e3', name: 'Front Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p6-e2', name: 'Pull-Up', sets: 4, reps: 8, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p6-e6', name: 'Kettlebell Swing', sets: 3, reps: 20, restSeconds: 60, muscleGroup: 'full-body' },
          { id: 'p6-e7', name: 'Hanging Leg Raise', sets: 3, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Interval Sprints',
        isRest: false,
        exercises: [
          { id: 'p6-e8', name: 'Sprint Intervals (30s on / 90s off)', sets: 8, reps: 1, restSeconds: 90, muscleGroup: 'cardio' },
          { id: 'p6-e4', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
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
        label: 'Ruck March + Core',
        isRest: false,
        exercises: [
          { id: 'p6-e1', name: 'Weighted Ruck March', sets: 1, reps: '6 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
    description: 'PFT/CFT-style training inspired by Marine Force Recon — pull-ups, timed runs, and functional carries that build real-world readiness.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 8,
    daysPerWeek: 4,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p7-e1', name: 'Pull-Up', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p7-e2', name: 'Timed Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p7-e3', name: 'Ammo-Can Carry (use kettlebell)', sets: 3, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
      { id: 'p7-e4', name: 'Sit-Up', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
    ],
    schedule: [
      {
        label: 'PFT Prep',
        isRest: false,
        exercises: [
          { id: 'p7-e1', name: 'Pull-Up', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p7-e4', name: 'Sit-Up', sets: 3, reps: 25, restSeconds: 45, muscleGroup: 'core' },
          { id: 'p7-e2', name: 'Timed Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
        label: 'Endurance Run',
        isRest: false,
        exercises: [
          { id: 'p7-e2', name: 'Timed Run', sets: 1, reps: '4 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
    description: 'Strength and hypertrophy in one — inspired by KSK training, built for soldiers who need both size and real-world utility.',
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
      rest(),
      rest(),
    ],
  },

  // ── P10: Legion Endurance (French Foreign Legion-inspired) ───────────────
  {
    id: 'p10',
    name: 'Legion Endurance',
    description: 'Progressive-overload rucking and disciplined volume increases every week — inspired by French Foreign Legion training.',
    level: 'intermediate',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 5,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p10-e2', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
      { id: 'p10-e3', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p10-e4', name: 'Pull-Up', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'back' },
    ],
    schedule: [
      {
        label: 'March Day',
        isRest: false,
        exercises: [
          { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
        ],
      },
      {
        label: 'Bodyweight Strength',
        isRest: false,
        exercises: [
          { id: 'p10-e2', name: 'Bodyweight Squat', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'legs' },
          { id: 'p10-e3', name: 'Push-Up', sets: 4, reps: 20, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p10-e4', name: 'Pull-Up', sets: 3, reps: 8, restSeconds: 90, muscleGroup: 'back' },
        ],
      },
      {
        label: 'Run + Core',
        isRest: false,
        exercises: [
          { id: 'p10-e5', name: 'Steady-State Run', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
          { id: 'p10-e6', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      rest(),
      {
        label: 'Long March',
        isRest: false,
        exercises: [
          { id: 'p10-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio' },
        ],
      },
      {
        label: 'Full Body Strength',
        isRest: false,
        exercises: [
          { id: 'p10-e7', name: 'Barbell Deadlift', sets: 4, reps: 6, restSeconds: 150, muscleGroup: 'back' },
          { id: 'p10-e8', name: 'Dumbbell Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
        ],
      },
      rest(),
    ],
  },

  // ── P11: Commando Combatives (IDF-inspired) ──────────────────────────────
  {
    id: 'p11',
    name: 'Commando Combatives',
    description: 'Kettlebell and bodyweight circuits styled after combatives conditioning — inspired by Israeli commando training.',
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
          { id: 'p11-e10', name: 'Interval Run (1 min hard / 1 min easy)', sets: 10, reps: 1, restSeconds: 0, muscleGroup: 'cardio' },
        ],
      },
      rest(),
      rest(),
    ],
  },

  // ── P12: SEAL Selection (US Navy SEALs-inspired) ─────────────────────────
  {
    id: 'p12',
    name: 'SEAL Selection',
    description: 'Calisthenics, swim-style conditioning intervals, and mental-toughness finishers — inspired by Navy SEAL training. Our advanced endurance flagship.',
    level: 'advanced',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p12-e1', name: 'Pull-Up', sets: 5, reps: 12, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p12-e2', name: 'Push-Up', sets: 5, reps: 25, restSeconds: 60, muscleGroup: 'chest' },
      { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '1000m', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p12-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
    ],
    schedule: [
      {
        label: 'PT Test Prep',
        isRest: false,
        exercises: [
          { id: 'p12-e1', name: 'Pull-Up', sets: 5, reps: 12, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p12-e2', name: 'Push-Up', sets: 5, reps: 25, restSeconds: 60, muscleGroup: 'chest' },
          { id: 'p12-e5', name: 'Sit-Up', sets: 4, reps: 25, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Swim Conditioning',
        isRest: false,
        exercises: [
          { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '1000m', restSeconds: 0, muscleGroup: 'cardio' },
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
          { id: 'p12-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
        label: 'Active Recovery Swim',
        isRest: false,
        exercises: [
          { id: 'p12-e3', name: 'Timed Swim / Row Machine', sets: 1, reps: '500m easy', restSeconds: 0, muscleGroup: 'cardio' },
        ],
      },
      rest(),
    ],
  },

  // ── P13: SAS Selection (British SAS-inspired) ────────────────────────────
  {
    id: 'p13',
    name: 'SAS Selection',
    description: 'The hardest ruck-mile volume and functional strength we offer — inspired by British SAS Selection. Our flagship program for the truly committed.',
    level: 'advanced',
    goal: 'endurance',
    weeks: 12,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p13-e2', name: 'Pull-Up', sets: 5, reps: 10, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p13-e3', name: 'Barbell Back Squat', sets: 5, reps: 5, restSeconds: 150, muscleGroup: 'legs' },
      { id: 'p13-e4', name: 'Farmer’s Carry', sets: 4, reps: '50m', restSeconds: 75, muscleGroup: 'full-body' },
    ],
    schedule: [
      {
        label: 'Big Ruck',
        isRest: false,
        exercises: [
          { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '10 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
          { id: 'p13-e6', name: 'Hill Sprint Intervals', sets: 8, reps: 1, restSeconds: 90, muscleGroup: 'cardio' },
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
          { id: 'p13-e1', name: 'Weighted Ruck March', sets: 1, reps: '8 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
    description: 'The most well-rounded hybrid we offer — strength, endurance, and swim-style conditioning combined, inspired by Air Force Pararescue training.',
    level: 'advanced',
    goal: 'general',
    weeks: 10,
    daysPerWeek: 6,
    isPublic: true,
    createdBy: 'system',
    exercises: [
      { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '800m', restSeconds: 0, muscleGroup: 'cardio' },
      { id: 'p14-e2', name: 'Pull-Up', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'back' },
      { id: 'p14-e3', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
      { id: 'p14-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
    ],
    schedule: [
      {
        label: 'Swim Conditioning',
        isRest: false,
        exercises: [
          { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '800m', restSeconds: 0, muscleGroup: 'cardio' },
          { id: 'p14-e5', name: 'Plank', sets: 3, reps: 60, restSeconds: 45, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Full Body Strength',
        isRest: false,
        exercises: [
          { id: 'p14-e3', name: 'Barbell Back Squat', sets: 4, reps: 8, restSeconds: 120, muscleGroup: 'legs' },
          { id: 'p14-e2', name: 'Pull-Up', sets: 4, reps: 12, restSeconds: 90, muscleGroup: 'back' },
          { id: 'p14-e6', name: 'Dumbbell Bench Press', sets: 4, reps: 10, restSeconds: 90, muscleGroup: 'chest' },
        ],
      },
      {
        label: 'Ruck March',
        isRest: false,
        exercises: [
          { id: 'p14-e4', name: 'Weighted Ruck March', sets: 1, reps: '5 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
          { id: 'p14-e1', name: 'Timed Swim / Row Machine', sets: 1, reps: '600m', restSeconds: 0, muscleGroup: 'cardio' },
          { id: 'p14-e9', name: 'Hanging Leg Raise', sets: 4, reps: 15, restSeconds: 60, muscleGroup: 'core' },
        ],
      },
      {
        label: 'Strength + Run',
        isRest: false,
        exercises: [
          { id: 'p14-e10', name: 'Deadlift', sets: 4, reps: 6, restSeconds: 150, muscleGroup: 'back' },
          { id: 'p14-e11', name: 'Steady-State Run', sets: 1, reps: '3 miles', restSeconds: 0, muscleGroup: 'cardio' },
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
  equipment?: string
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
