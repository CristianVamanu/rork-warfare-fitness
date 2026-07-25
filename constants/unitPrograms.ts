import type { Program, Workout, Exercise } from '@/contexts/TrainingContext';

type BlockExercise = Omit<Exercise, 'id'>;

type Block = {
  name: string;
  group: string;
  isRest?: boolean;
  exercises?: BlockExercise[];
};

function buildUnitWorkout(idSeed: string, block: Block): Workout {
  const id = `${idSeed}-${block.name.replace(/\s+/g, '-')}`;
  const exercises: Exercise[] = (block.exercises ?? []).map((e, i) => ({
    ...e,
    id: `${id}-${i + 1}`,
  }));
  const durationMin = exercises.reduce(
    (sum, e) => sum + (e.isCardio ? (e.cardioDurationMin ?? 25) : 8),
    10
  );
  return { id, name: block.name, durationMin, muscleGroup: block.group, exercises };
}

function buildUnitSchedule(programId: string, blocks: Block[], totalDays = 90) {
  const schedule: { day: number; workout: Workout | null }[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const block = blocks[(d - 1) % blocks.length];
    schedule.push({
      day: d,
      workout: block.isRest ? null : buildUnitWorkout(`${programId}-${d}`, block),
    });
  }
  return schedule;
}

function unitProgram(config: {
  id: string;
  title: string;
  unit: string;
  description: string;
  difficulty: Program['difficulty'];
  primaryGoal: string;
  secondaryGoals: string[];
  blocks: Block[];
}): Program {
  return {
    id: config.id,
    title: config.title,
    unit: config.unit,
    description: config.description,
    days: 90,
    schedule: buildUnitSchedule(config.id, config.blocks),
    completedDays: {},
    accessLevel: 'premium',
    isPaid: true,
    requiresSubscription: true,
    difficulty: config.difficulty,
    primaryGoal: config.primaryGoal,
    secondaryGoals: config.secondaryGoals,
  };
}

export const UNIT_PROGRAMS: Program[] = [
  unitProgram({
    id: 'navy-seals-buds',
    title: 'Navy SEALs BUD/S Prep',
    unit: 'U.S. Navy SEALs',
    description:
      'Modeled on Basic Underwater Demolition/SEAL training: calisthenics, swimming, log PT, and rucking built to forge elite endurance and mental toughness.',
    difficulty: 'Elite',
    primaryGoal: 'Improve Endurance',
    secondaryGoals: ['Lose Fat', 'General Fitness'],
    blocks: [
      { name: 'PT Test Prep', group: 'Calisthenics', exercises: [
        { name: 'Push-ups', sets: 4, reps: '20', restSec: 60 },
        { name: 'Pull-ups', sets: 4, reps: 'Max', restSec: 90 },
        { name: 'Sit-ups', sets: 4, reps: '25', restSec: 60 },
        { name: 'Timed Run', sets: 1, reps: '4 miles', restSec: 0, isCardio: true, cardioDurationMin: 32 },
      ]},
      { name: 'Combat Swimmer Stroke', group: 'Swim', exercises: [
        { name: 'Pool Interval Swim', sets: 8, reps: '100m', restSec: 45, isCardio: true, cardioDurationMin: 30 },
        { name: 'Treading Water (hands up)', sets: 3, reps: '2 min', restSec: 60, isCardio: true },
        { name: 'Underwater Recovery Drill', sets: 4, reps: '25m', restSec: 60 },
      ]},
      { name: 'Log PT & Team Strength', group: 'Full Body', exercises: [
        { name: 'Log Press', sets: 4, reps: '10', restSec: 90 },
        { name: 'Log Squat', sets: 4, reps: '12', restSec: 90 },
        { name: 'Overhead Log Carry', sets: 3, reps: '40m', restSec: 90 },
        { name: 'Bear Crawl', sets: 3, reps: '20m', restSec: 60 },
      ]},
      { name: 'O-Course Simulation', group: 'Conditioning', exercises: [
        { name: 'Sprint Intervals', sets: 8, reps: '100m', restSec: 45, isCardio: true },
        { name: 'Rope Climb', sets: 5, reps: '1 climb', restSec: 90 },
        { name: 'Burpee Broad Jumps', sets: 4, reps: '10', restSec: 60 },
        { name: 'Farmers Carry', sets: 3, reps: '40m', restSec: 75 },
      ]},
      { name: 'Rucking', group: 'Endurance', exercises: [
        { name: 'Ruck March (45lb pack)', sets: 1, reps: '6 miles', restSec: 0, isCardio: true, cardioDurationMin: 90 },
      ]},
      { name: 'Surf Torture Conditioning', group: 'Core', exercises: [
        { name: 'Flutter Kicks', sets: 4, reps: '30', restSec: 45 },
        { name: 'Mountain Climbers', sets: 4, reps: '40', restSec: 45 },
        { name: 'Plank Hold', sets: 3, reps: '90s', restSec: 45 },
        { name: 'Cold Water Immersion (recovery)', sets: 1, reps: '5 min', restSec: 0 },
      ]},
      { name: 'Active Recovery', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'army-rangers-rasp',
    title: 'Army Rangers RASP Prep',
    unit: 'U.S. Army Rangers',
    description:
      'Built around the Ranger Assessment and Selection Program: heavy rucking, grip strength, sprint conditioning, and combatives to build a total-body workhorse.',
    difficulty: 'Advanced',
    primaryGoal: 'Get Stronger',
    secondaryGoals: ['Improve Endurance'],
    blocks: [
      { name: 'Ranger PT Test', group: 'Calisthenics', exercises: [
        { name: 'Push-ups', sets: 5, reps: '20', restSec: 60 },
        { name: 'Sit-ups', sets: 5, reps: '25', restSec: 60 },
        { name: 'Timed Run', sets: 1, reps: '5 miles', restSec: 0, isCardio: true, cardioDurationMin: 40 },
      ]},
      { name: 'Ruck Strength', group: 'Endurance', exercises: [
        { name: 'Ruck March (65lb pack)', sets: 1, reps: '8 miles', restSec: 0, isCardio: true, cardioDurationMin: 120 },
      ]},
      { name: 'Combatives & Strength', group: 'Full Body', exercises: [
        { name: 'Deadlift', sets: 5, reps: '5', restSec: 120 },
        { name: 'Weighted Pull-ups', sets: 4, reps: '6', restSec: 90 },
        { name: 'Sandbag Clean & Press', sets: 4, reps: '8', restSec: 90 },
      ]},
      { name: 'Sprint Conditioning', group: 'Conditioning', exercises: [
        { name: '400m Repeats', sets: 8, reps: '400m', restSec: 90, isCardio: true },
      ]},
      { name: 'Obstacle & Grip', group: 'Grip', exercises: [
        { name: 'Rope Climb', sets: 5, reps: '1 climb', restSec: 90 },
        { name: 'Farmers Carry', sets: 4, reps: '50m', restSec: 75 },
        { name: 'Dead Hang', sets: 4, reps: '45s', restSec: 60 },
      ]},
      { name: 'Team Movement Drills', group: 'Functional', exercises: [
        { name: 'Buddy Carry', sets: 4, reps: '30m', restSec: 90 },
        { name: 'Fireman Carry Sprint', sets: 4, reps: '20m', restSec: 90 },
        { name: 'Low Crawl', sets: 3, reps: '20m', restSec: 60 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'green-berets-qcourse',
    title: 'Green Berets Q-Course Prep',
    unit: 'U.S. Army Special Forces',
    description:
      'Inspired by Special Forces Assessment and Selection: balanced strength, long rucks, and swim conditioning for the all-around tactical athlete.',
    difficulty: 'Advanced',
    primaryGoal: 'General Fitness',
    secondaryGoals: ['Get Stronger', 'Improve Endurance'],
    blocks: [
      { name: 'SFAS PT Test', group: 'Calisthenics', exercises: [
        { name: 'Push-ups', sets: 4, reps: '20', restSec: 60 },
        { name: 'Sit-ups', sets: 4, reps: '20', restSec: 60 },
        { name: 'Pull-ups', sets: 4, reps: 'Max', restSec: 75 },
        { name: 'Timed Run', sets: 1, reps: '2 miles', restSec: 0, isCardio: true, cardioDurationMin: 16 },
      ]},
      { name: 'Ruck Endurance', group: 'Endurance', exercises: [
        { name: 'Ruck March (40lb pack)', sets: 1, reps: '6 miles', restSec: 0, isCardio: true, cardioDurationMin: 90 },
      ]},
      { name: 'Functional Strength', group: 'Full Body', exercises: [
        { name: 'Back Squat', sets: 5, reps: '5', restSec: 120 },
        { name: 'Bench Press', sets: 4, reps: '8', restSec: 90 },
        { name: 'Bent-over Row', sets: 4, reps: '10', restSec: 75 },
      ]},
      { name: 'Land Navigation Conditioning', group: 'Conditioning', exercises: [
        { name: 'Weighted Step-ups', sets: 4, reps: '15/leg', restSec: 60 },
        { name: 'Loaded Carries', sets: 4, reps: '40m', restSec: 75 },
        { name: 'Hill Sprints', sets: 6, reps: '30s', restSec: 60, isCardio: true },
      ]},
      { name: 'Swim & Core', group: 'Swim', exercises: [
        { name: 'Combat Swim', sets: 6, reps: '50m', restSec: 45, isCardio: true, cardioDurationMin: 25 },
        { name: 'Hanging Leg Raise', sets: 4, reps: '15', restSec: 60 },
        { name: 'Weighted Sit-ups', sets: 4, reps: '20', restSec: 60 },
      ]},
      { name: 'Long Ruck', group: 'Endurance', exercises: [
        { name: 'Ruck March (40lb pack)', sets: 1, reps: '10 miles', restSec: 0, isCardio: true, cardioDurationMin: 150 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'marsoc-force-recon',
    title: 'MARSOC Force Recon Conditioning',
    unit: 'U.S. Marine Raiders / Force Recon',
    description:
      'A hypertrophy-and-power hybrid drawing on Marine Special Operations conditioning: explosive lifts, swim intervals, and heavy carries.',
    difficulty: 'Advanced',
    primaryGoal: 'Build Muscle',
    secondaryGoals: ['Get Stronger'],
    blocks: [
      { name: 'CFT Prep', group: 'Conditioning', exercises: [
        { name: 'Movement to Contact Sprint', sets: 6, reps: '880y', restSec: 90, isCardio: true },
        { name: 'Ammo Can Lift', sets: 4, reps: '2 min AMRAP', restSec: 90 },
        { name: 'Maneuver Under Fire Circuit', sets: 3, reps: '1 round', restSec: 120 },
      ]},
      { name: 'Power Strength', group: 'Full Body', exercises: [
        { name: 'Front Squat', sets: 5, reps: '5', restSec: 120 },
        { name: 'Weighted Dips', sets: 4, reps: '8', restSec: 90 },
        { name: 'Power Clean', sets: 5, reps: '3', restSec: 120 },
      ]},
      { name: 'Swim Conditioning', group: 'Swim', exercises: [
        { name: 'Combat Swimmer Stroke Intervals', sets: 8, reps: '50m', restSec: 40, isCardio: true, cardioDurationMin: 30 },
        { name: 'Fin Kick Sets', sets: 4, reps: '50m', restSec: 45 },
      ]},
      { name: 'Hypertrophy Push', group: 'Chest/Shoulders', exercises: [
        { name: 'Bench Press', sets: 4, reps: '8-10', restSec: 90 },
        { name: 'Incline DB Press', sets: 4, reps: '10', restSec: 75 },
        { name: 'Overhead Press', sets: 3, reps: '10', restSec: 75 },
      ]},
      { name: 'Hypertrophy Pull', group: 'Back/Arms', exercises: [
        { name: 'Pull-ups', sets: 4, reps: 'Max', restSec: 90 },
        { name: 'Barbell Row', sets: 4, reps: '10', restSec: 75 },
        { name: 'Face Pulls', sets: 3, reps: '15', restSec: 45 },
      ]},
      { name: 'Rucking & Grip', group: 'Endurance', exercises: [
        { name: 'Ruck March (50lb pack)', sets: 1, reps: '8 miles', restSec: 0, isCardio: true, cardioDurationMin: 120 },
        { name: 'Farmers Carry', sets: 3, reps: '40m', restSec: 75 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'sas-selection',
    title: 'SAS Selection: Fan Dance',
    unit: 'British Special Air Service',
    description:
      'Named for the brutal Pen y Fan "Fan Dance" test: relentless hill work, weighted marches, and endurance racing for elite-level stamina.',
    difficulty: 'Elite',
    primaryGoal: 'Improve Endurance',
    secondaryGoals: ['Lose Fat'],
    blocks: [
      { name: 'Hill Reps', group: 'Endurance', exercises: [
        { name: 'Weighted Hill Sprints (35lb bergen)', sets: 8, reps: '60s', restSec: 90, isCardio: true },
      ]},
      { name: 'Fan Dance Simulation', group: 'Endurance', exercises: [
        { name: 'Long Ruck Over Hill Terrain', sets: 1, reps: '15 miles', restSec: 0, isCardio: true, cardioDurationMin: 220 },
      ]},
      { name: 'Strength Circuit', group: 'Full Body', exercises: [
        { name: 'Deadlift', sets: 5, reps: '5', restSec: 120 },
        { name: 'Weighted Pull-ups', sets: 4, reps: '6', restSec: 90 },
        { name: 'Sandbag Carries', sets: 4, reps: '50m', restSec: 75 },
      ]},
      { name: 'Speed March', group: 'Endurance', exercises: [
        { name: 'Timed March w/ Pack at Pace', sets: 1, reps: '8 miles', restSec: 0, isCardio: true, cardioDurationMin: 110 },
      ]},
      { name: 'Log Race & Team PT', group: 'Functional', exercises: [
        { name: 'Log Carry Relay', sets: 5, reps: '40m', restSec: 90 },
        { name: 'Fireman Carry', sets: 4, reps: '30m', restSec: 90 },
      ]},
      { name: 'Endurance Test', group: 'Cardio', exercises: [
        { name: 'Timed Run', sets: 1, reps: '10 miles', restSec: 0, isCardio: true, cardioDurationMin: 80 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'foreign-legion-endurance',
    title: 'Foreign Legion Endurance',
    unit: 'French Foreign Legion',
    description:
      'A ground-up program modeled on Legion basic training — building raw recruits into disciplined, tireless marchers through bodyweight fundamentals and progressive rucking.',
    difficulty: 'Beginner',
    primaryGoal: 'General Fitness',
    secondaryGoals: ['Improve Endurance'],
    blocks: [
      { name: 'Marche Militaire', group: 'Endurance', exercises: [
        { name: 'Ruck March (25lb pack)', sets: 1, reps: '5 miles', restSec: 0, isCardio: true, cardioDurationMin: 75 },
      ]},
      { name: 'Calisthenics de Base', group: 'Calisthenics', exercises: [
        { name: 'Push-ups', sets: 3, reps: '12', restSec: 60 },
        { name: 'Sit-ups', sets: 3, reps: '15', restSec: 60 },
        { name: 'Bodyweight Squats', sets: 3, reps: '20', restSec: 45 },
        { name: 'Pull-ups (assisted if needed)', sets: 3, reps: '6', restSec: 75 },
      ]},
      { name: 'Cross-Country Run', group: 'Cardio', exercises: [
        { name: 'Timed Run', sets: 1, reps: '5K', restSec: 0, isCardio: true, cardioDurationMin: 30 },
      ]},
      { name: 'Obstacle Course', group: 'Functional', exercises: [
        { name: 'Wall Climb', sets: 4, reps: '3 reps', restSec: 60 },
        { name: 'Rope Crawl', sets: 3, reps: '15m', restSec: 60 },
        { name: 'Sprint Shuttles', sets: 4, reps: '20m x4', restSec: 60, isCardio: true },
      ]},
      { name: 'Strength Foundations', group: 'Full Body', exercises: [
        { name: 'Goblet Squat', sets: 3, reps: '12', restSec: 60 },
        { name: 'Dumbbell Row', sets: 3, reps: '12', restSec: 60 },
        { name: 'Push Press', sets: 3, reps: '10', restSec: 75 },
      ]},
      { name: 'Long March', group: 'Endurance', exercises: [
        { name: 'Ruck March (30lb pack)', sets: 1, reps: '8 miles', restSec: 0, isCardio: true, cardioDurationMin: 115 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'spetsnaz-alpha',
    title: 'Spetsnaz Alpha Group Power',
    unit: 'Russian Spetsnaz',
    description:
      'A power-and-hypertrophy program in the Spetsnaz tradition: heavy barbell strength paired with combatives-style conditioning for raw, functional mass.',
    difficulty: 'Advanced',
    primaryGoal: 'Build Muscle',
    secondaryGoals: ['Get Stronger'],
    blocks: [
      { name: 'Power & Strength', group: 'Full Body', exercises: [
        { name: 'Back Squat', sets: 5, reps: '5', restSec: 120 },
        { name: 'Weighted Pull-ups', sets: 4, reps: '6', restSec: 90 },
        { name: 'Push Press', sets: 4, reps: '6', restSec: 90 },
      ]},
      { name: 'Combatives Conditioning', group: 'Conditioning', exercises: [
        { name: 'Sprawl-Sprint Drills', sets: 6, reps: '30s', restSec: 45, isCardio: true },
        { name: 'Tire Flips', sets: 5, reps: '8', restSec: 75 },
        { name: 'Sledgehammer Slams', sets: 4, reps: '20', restSec: 60 },
      ]},
      { name: 'Hypertrophy Upper', group: 'Chest/Back', exercises: [
        { name: 'Bench Press', sets: 4, reps: '8-10', restSec: 90 },
        { name: 'Barbell Row', sets: 4, reps: '10', restSec: 75 },
        { name: 'Weighted Dips', sets: 3, reps: '10', restSec: 75 },
      ]},
      { name: 'Hypertrophy Lower', group: 'Legs', exercises: [
        { name: 'Front Squat', sets: 4, reps: '8', restSec: 100 },
        { name: 'Romanian Deadlift', sets: 4, reps: '10', restSec: 90 },
        { name: 'Walking Lunges', sets: 3, reps: '20', restSec: 60 },
      ]},
      { name: 'Explosive Conditioning', group: 'Conditioning', exercises: [
        { name: 'Kettlebell Swings', sets: 5, reps: '20', restSec: 45 },
        { name: 'Box Jumps', sets: 4, reps: '10', restSec: 60 },
        { name: 'Battle Ropes', sets: 4, reps: '30s', restSec: 45 },
      ]},
      { name: 'Grip & Carry', group: 'Grip', exercises: [
        { name: 'Farmers Carry', sets: 4, reps: '50m', restSec: 75 },
        { name: 'Sandbag Clean & Carry', sets: 4, reps: '30m', restSec: 75 },
        { name: 'Rope Climb', sets: 4, reps: '1 climb', restSec: 90 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'sayeret-matkal-allaround',
    title: 'Sayeret Matkal All-Around',
    unit: 'Israeli Sayeret Matkal',
    description:
      'A balanced, all-around athletic program blending Krav Maga conditioning, strength, agility, and desert rucking for total operational readiness.',
    difficulty: 'Intermediate',
    primaryGoal: 'General Fitness',
    secondaryGoals: ['Improve Endurance', 'Get Stronger'],
    blocks: [
      { name: 'Krav Maga Conditioning', group: 'Conditioning', exercises: [
        { name: 'Pad Combo Rounds', sets: 6, reps: '2 min', restSec: 60, isCardio: true },
        { name: 'Sprawl-Sprint Circuit', sets: 5, reps: '30s', restSec: 45, isCardio: true },
      ]},
      { name: 'Strength', group: 'Full Body', exercises: [
        { name: 'Deadlift', sets: 4, reps: '6', restSec: 100 },
        { name: 'Overhead Press', sets: 4, reps: '8', restSec: 75 },
        { name: 'Pull-ups', sets: 4, reps: 'Max', restSec: 90 },
      ]},
      { name: 'Desert Ruck', group: 'Endurance', exercises: [
        { name: 'Ruck March (35lb pack)', sets: 1, reps: '6 miles', restSec: 0, isCardio: true, cardioDurationMin: 90 },
      ]},
      { name: 'Speed & Agility', group: 'Agility', exercises: [
        { name: 'Shuttle Sprints', sets: 6, reps: '20m x4', restSec: 60, isCardio: true },
        { name: 'Broad Jumps', sets: 4, reps: '8', restSec: 60 },
        { name: 'Agility Ladder', sets: 4, reps: '1 pass', restSec: 45 },
      ]},
      { name: 'Full Body Circuit', group: 'Conditioning', exercises: [
        { name: 'Burpees', sets: 4, reps: '15', restSec: 45 },
        { name: 'Kettlebell Swings', sets: 4, reps: '20', restSec: 45 },
        { name: 'Push-ups', sets: 4, reps: '20', restSec: 45 },
        { name: 'Air Squats', sets: 4, reps: '25', restSec: 45 },
      ]},
      { name: 'Swim Conditioning', group: 'Swim', exercises: [
        { name: 'Pool Interval Swim', sets: 6, reps: '50m', restSec: 45, isCardio: true, cardioDurationMin: 25 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'ksk-kommando-strength',
    title: 'KSK Kommando Strength',
    unit: 'German Kommando Spezialkräfte',
    description:
      'A precision strength-and-conditioning block built on German special forces doctrine: maximal barbell lifts paired with tactical loaded conditioning.',
    difficulty: 'Intermediate',
    primaryGoal: 'Get Stronger',
    secondaryGoals: ['Build Muscle'],
    blocks: [
      { name: 'Maximal Strength', group: 'Full Body', exercises: [
        { name: 'Back Squat', sets: 5, reps: '5', restSec: 120 },
        { name: 'Bench Press', sets: 5, reps: '5', restSec: 120 },
        { name: 'Deadlift', sets: 5, reps: '5', restSec: 150 },
      ]},
      { name: 'Tactical Conditioning', group: 'Conditioning', exercises: [
        { name: 'Weighted Vest Circuit', sets: 4, reps: '3 min', restSec: 75, isCardio: true },
        { name: 'Sled Push', sets: 5, reps: '20m', restSec: 90 },
        { name: 'Battle Ropes', sets: 4, reps: '30s', restSec: 45 },
      ]},
      { name: 'Ruck & Terrain', group: 'Endurance', exercises: [
        { name: 'Ruck March (40lb pack, rough terrain)', sets: 1, reps: '7 miles', restSec: 0, isCardio: true, cardioDurationMin: 105 },
      ]},
      { name: 'Upper Body Strength', group: 'Upper', exercises: [
        { name: 'Weighted Pull-ups', sets: 4, reps: '6', restSec: 90 },
        { name: 'Overhead Press', sets: 4, reps: '8', restSec: 90 },
        { name: 'Barbell Row', sets: 4, reps: '10', restSec: 75 },
      ]},
      { name: 'Lower Body Strength', group: 'Lower', exercises: [
        { name: 'Front Squat', sets: 4, reps: '8', restSec: 100 },
        { name: 'Bulgarian Split Squat', sets: 3, reps: '12/leg', restSec: 75 },
        { name: 'Hip Thrust', sets: 4, reps: '12', restSec: 75 },
      ]},
      { name: 'CQB Conditioning', group: 'Conditioning', exercises: [
        { name: 'Shoot-house Sprint Drills', sets: 6, reps: '20m', restSec: 45, isCardio: true },
        { name: 'Agility Circuit', sets: 4, reps: '1 round', restSec: 60 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),

  unitProgram({
    id: 'grom-cqb-conditioning',
    title: 'GROM CQB Conditioning',
    unit: 'Polish GROM',
    description:
      'A fat-loss-focused metabolic conditioning program built on close-quarters-battle style training: high-tempo circuits, ruck intervals, and sprint work.',
    difficulty: 'Intermediate',
    primaryGoal: 'Lose Fat',
    secondaryGoals: ['Improve Endurance'],
    blocks: [
      { name: 'HIIT Fat Burn', group: 'Conditioning', exercises: [
        { name: 'Kettlebell Swings', sets: 5, reps: '20', restSec: 30 },
        { name: 'Burpees', sets: 5, reps: '15', restSec: 30 },
        { name: 'Mountain Climbers', sets: 5, reps: '40', restSec: 30 },
      ]},
      { name: 'CQB Drills', group: 'Agility', exercises: [
        { name: 'Sprint-Stop-Sprawl Combos', sets: 6, reps: '30s', restSec: 45, isCardio: true },
        { name: 'Agility Ladder', sets: 4, reps: '1 pass', restSec: 45 },
      ]},
      { name: 'Ruck Conditioning', group: 'Endurance', exercises: [
        { name: 'Ruck March w/ Pace Intervals (30lb pack)', sets: 1, reps: '5 miles', restSec: 0, isCardio: true, cardioDurationMin: 70 },
      ]},
      { name: 'Metabolic Strength', group: 'Full Body', exercises: [
        { name: 'Thrusters', sets: 4, reps: '15', restSec: 45 },
        { name: 'Push Press', sets: 4, reps: '12', restSec: 60 },
        { name: 'Renegade Rows', sets: 4, reps: '16', restSec: 45 },
      ]},
      { name: 'Interval Sprints', group: 'Cardio', exercises: [
        { name: '200m Repeats', sets: 10, reps: '200m', restSec: 45, isCardio: true },
      ]},
      { name: 'Core & Combatives', group: 'Core', exercises: [
        { name: 'Weighted Sit-ups', sets: 4, reps: '20', restSec: 45 },
        { name: 'Russian Twists', sets: 4, reps: '30', restSec: 45 },
        { name: 'Sprawl Drills', sets: 4, reps: '15', restSec: 45 },
      ]},
      { name: 'Rest Day', group: 'Rest', isRest: true },
    ],
  }),
];

const DIFFICULTY_ORDER: Record<NonNullable<Program['difficulty']>, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
  Elite: 3,
};

const EXPERIENCE_TO_DIFFICULTY: Record<string, NonNullable<Program['difficulty']>> = {
  'Complete Beginner': 'Beginner',
  'Some Experience': 'Beginner',
  'Intermediate': 'Intermediate',
  'Advanced': 'Advanced',
  'Elite': 'Elite',
};

export function recommendProgramId(goal: string, experience: string): string {
  const targetTier = EXPERIENCE_TO_DIFFICULTY[experience] ?? 'Intermediate';
  let bestId = UNIT_PROGRAMS[0].id;
  let bestScore = -1;

  for (const program of UNIT_PROGRAMS) {
    let score = 0;
    if (program.primaryGoal === goal) score += 3;
    else if (program.secondaryGoals?.includes(goal)) score += 1;

    const tierDistance = Math.abs(
      DIFFICULTY_ORDER[program.difficulty ?? 'Intermediate'] - DIFFICULTY_ORDER[targetTier]
    );
    score += Math.max(0, 2 - tierDistance);

    if (score > bestScore) {
      bestScore = score;
      bestId = program.id;
    }
  }

  return bestId;
}
