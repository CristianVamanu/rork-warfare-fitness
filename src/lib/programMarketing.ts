import type { Program, ProgramDay } from '@/types';

/**
 * Sales copy for a program page, derived entirely from that program's own data.
 *
 * TWO RULES GOVERN THIS FILE.
 *
 * 1. Nothing is invented. Every number — weeks, sessions, training days,
 *    phase ranges, equipment — is computed from the program document, so an
 *    admin editing a program updates its marketing page in the same act and
 *    the page can never advertise a twelve-week plan that is actually eight.
 *
 * 2. THE PRESCRIPTION IS NEVER PUBLISHED. No exercise names, no sets, no reps,
 *    no rest periods, no tempo. That is the product. An earlier version of this
 *    page printed two complete sessions with sets and reps in the name of
 *    "proving the program is real", which is a good instinct aimed at the wrong
 *    target: nobody has ever ranked a page by listing "3 × 8 back squat", and
 *    anyone who wanted the programme could simply read it.
 *
 * What ranks is substantial, specific, unique prose that answers what the
 * searcher actually asked — who it is for, what it does to you, what the
 * commitment is, what you need. All of that can be written truthfully at
 * length without giving away a single session, and that is what this builds.
 */

const GOAL_LABEL: Record<Program['goal'], string> = {
  strength: 'Strength',
  hypertrophy: 'Muscle Building',
  endurance: 'Endurance',
  'weight-loss': 'Fat Loss',
  general: 'General Fitness',
};

const LEVEL_LABEL: Record<Program['level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** The promise, per goal. Written to sell, not to describe. */
const GOAL_COPY: Record<Program['goal'], { hook: string; outcomes: string[] }> = {
  strength: {
    hook: 'Strength is the one quality everything else is built on. This block goes and gets it.',
    outcomes: [
      'Measurably heavier on the lifts that matter, not just busier in the gym',
      'Progression handled for you — the weight moves because the plan moves it',
      'Joints and connective tissue brought along with the numbers, not left behind',
      'A base that makes every other kind of training easier afterwards',
    ],
  },
  hypertrophy: {
    hook: 'Muscle is built by accumulated, organised tension. This is that, arranged properly.',
    outcomes: [
      'Real size in the areas people actually train for',
      'Volume that climbs deliberately instead of randomly',
      'Enough recovery built in that you keep training instead of stalling',
      'A physique that reflects the work, because the work was structured',
    ],
  },
  endurance: {
    hook: 'Engine, work capacity, and the ability to keep going after everyone else has stopped.',
    outcomes: [
      'Aerobic base that holds up under load, not just on a treadmill',
      'Work capacity that carries over to rucks, hills and long days',
      'The mental half — knowing what you can still do when it stops being fun',
      'Recovery between hard efforts measured in minutes, not hours',
    ],
  },
  'weight-loss': {
    hook: 'Strip fat without training like a cardio machine and without losing what you built.',
    outcomes: [
      'Fat lost while strength is defended, not sacrificed',
      'Conditioning that improves week on week instead of just burning calories',
      'Calorie and macro targets calculated for your body, not a generic number',
      'A rate of change you can actually sustain to the end of the block',
    ],
  },
  general: {
    hook: 'Broadly hard to kill. Strong enough, fit enough, and bad at nothing.',
    outcomes: [
      'Strength, conditioning and mobility moving together rather than in turns',
      'A body that handles whatever the week asks of it',
      'Consistency, because the plan fits a real life',
      'A foundation you can specialise from later',
    ],
  },
};

const LEVEL_COPY: Record<Program['level'], { requirement: string; honest: string }> = {
  beginner: {
    requirement: 'No training background needed. If you can commit to the schedule, you can start this week.',
    honest: 'Built for someone starting out or coming back after a long break. It will still be hard — it just will not assume you already know what you are doing.',
  },
  intermediate: {
    requirement: 'Assumes you already train and know your way around the basic lifts. This is not a first program.',
    honest: 'If you have been training a while and stopped making progress because nothing was actually planned, this is the fix.',
  },
  advanced: {
    requirement: 'Built for people already training hard and recovering well. Expect it to hurt.',
    honest: 'This is not a starting point. If you have not been training consistently for a year or more, pick something else first — you will get more from it.',
  },
};

/** Equipment categories inferred from exercise names. Reveals what you NEED,
 *  never what you DO — "barbell" tells a buyer whether they can run the
 *  program; it does not tell them the program. */
const EQUIPMENT_RULES: { match: RegExp; label: string }[] = [
  { match: /barbell|bench press|deadlift|back squat|front squat|clean|snatch|overhead press/i, label: 'Barbell and plates' },
  { match: /dumbbell|db /i, label: 'Dumbbells' },
  { match: /kettlebell|kb |swing|turkish/i, label: 'Kettlebell' },
  { match: /pull-?up|chin-?up|hanging|muscle-?up/i, label: 'Pull-up bar' },
  { match: /machine|cable|lat pulldown|leg press|pec deck/i, label: 'Gym machines or cables' },
  { match: /row(ing)? (machine|erg)|erg /i, label: 'Rower' },
  { match: /run|sprint|ruck|march|hill/i, label: 'Somewhere to run or ruck' },
  { match: /swim/i, label: 'Pool access' },
  { match: /box jump|plyo box|step-?up/i, label: 'Box or step' },
  { match: /band|resistance band/i, label: 'Resistance bands' },
  { match: /sled|prowler|farmer|yoke/i, label: 'Sled or carry implements' },
];

export interface ProgramFaq { q: string; a: string }

export interface ProgramMarketing {
  seoTitle: string;
  seoDescription: string;
  headline: string;
  eyebrow: string;
  hook: string;
  subheadline: string;
  stats: { label: string; value: string }[];
  /** Admin-written description — the one piece of genuinely bespoke copy. */
  whoFor: string;
  honest: string;
  requirement: string;
  outcomes: string[];
  /** Phase labels and week ranges: the shape of the block, not its contents. */
  phases: { label: string; weeks: string }[];
  /** How a week is SHAPED — training days vs rest. No session content. */
  rhythm: { trainingDays: number; restDays: number; description: string };
  equipment: string[];
  commitment: string;
  totalSessions: number;
  includes: string[];
  faq: ProgramFaq[];
}

function scheduleOf(p: Program): ProgramDay[] {
  if (p.phases?.length && p.phases[0]?.schedule?.length) return p.phases[0].schedule;
  return p.schedule ?? [];
}

/** Every exercise name in the program — read ONLY to infer equipment, never
 *  surfaced. */
function allExerciseNames(p: Program): string {
  const days = [
    ...(p.schedule ?? []),
    ...(p.phases ?? []).flatMap((ph) => ph.schedule ?? []),
  ];
  const fromDays = days.flatMap((d) => (d.exercises ?? []).map((e) => e.name));
  const flat = (p.exercises ?? []).map((e) => e.name);
  return [...fromDays, ...flat].join(' | ');
}

/**
 * @param trialDisclosure The live trial terms (getPublicTrialTerms). Passed in
 *   rather than read here because this file is pure and synchronous — and
 *   because the cancel/pricing FAQ is emitted as FAQPage structured data, so a
 *   hardcoded "you start free" would have been a false claim served to Google
 *   itself the moment Paid Trial was switched on.
 */
export function buildProgramMarketing(p: Program, trialDisclosure?: string): ProgramMarketing {
  const schedule = scheduleOf(p);
  const trainingDays = schedule.filter((d) => !d.isRest).length || p.daysPerWeek;
  const restDays = Math.max(0, 7 - trainingDays);
  const totalSessions = p.weeks * p.daysPerWeek;
  const goalLabel = GOAL_LABEL[p.goal] ?? 'Fitness';
  const goalCopy = GOAL_COPY[p.goal] ?? GOAL_COPY.general;
  const levelCopy = LEVEL_COPY[p.level] ?? LEVEL_COPY.intermediate;

  const haystack = allExerciseNames(p);
  const equipment = EQUIPMENT_RULES.filter((r) => r.match.test(haystack)).map((r) => r.label);
  // Everything has a floor of bodyweight; saying so is more useful than an
  // empty list on a program that genuinely needs nothing.
  if (equipment.length === 0) equipment.push('Nothing — bodyweight only');

  const phases = (p.phases ?? []).map((ph) => ({
    label: ph.label,
    weeks: ph.startWeek === ph.endWeek ? `Week ${ph.startWeek}` : `Weeks ${ph.startWeek}–${ph.endWeek}`,
  }));

  const commitment = `${p.daysPerWeek} sessions a week for ${p.weeks} weeks — ${totalSessions} in total.`;

  const faq: ProgramFaq[] = [
    {
      q: `How long is ${p.name}?`,
      a: `${p.weeks} weeks, training ${p.daysPerWeek} days a week — ${totalSessions} sessions in total.` +
         (phases.length ? ` It runs in ${phases.length} phases, each building on the one before it.` : ''),
    },
    {
      q: 'What equipment do I need?',
      a: `${equipment.join(', ')}. Where a movement needs kit you do not have, the app will suggest a substitute that keeps the session intact.`,
    },
    {
      q: 'Is this suitable for me?',
      a: `${levelCopy.requirement} ${levelCopy.honest}`,
    },
    {
      q: 'What happens if I miss a session?',
      a: 'Nothing breaks. The program tracks where you actually are rather than where the calendar says you should be, so you pick up at the next session instead of falling behind a schedule you cannot catch.',
    },
    {
      q: 'Do I get nutrition guidance too?',
      a: `Yes. Calorie and macro targets are calculated for your body, your training load and this goal — ${goalLabel.toLowerCase()} — and adjust as your weight changes.`,
    },
    {
      q: 'Can I cancel?',
      a: `Yes, any time, from inside the app. ${trialDisclosure ?? 'Cancel anytime.'}`,
    },
  ];

  return {
    seoTitle: `${p.name} — ${p.weeks}-Week ${goalLabel} Program`,
    seoDescription:
      `${p.name}: a ${p.weeks}-week ${goalLabel.toLowerCase()} program, ${p.daysPerWeek} days a week. ` +
      `${LEVEL_LABEL[p.level]} level, ${totalSessions} coached sessions with progression built in. Start free.`,
    headline: p.name,
    eyebrow: `${LEVEL_LABEL[p.level]} · ${goalLabel}`,
    hook: goalCopy.hook,
    subheadline:
      `${p.weeks} weeks. ${p.daysPerWeek} days a week. ${totalSessions} sessions, each one written, ordered and progressed for you.`,
    stats: [
      { label: 'Length', value: `${p.weeks} weeks` },
      { label: 'Frequency', value: `${p.daysPerWeek}×/week` },
      { label: 'Sessions', value: `${totalSessions}` },
      { label: 'Level', value: LEVEL_LABEL[p.level] },
    ],
    whoFor: p.description,
    honest: levelCopy.honest,
    requirement: levelCopy.requirement,
    outcomes: goalCopy.outcomes,
    phases,
    rhythm: {
      trainingDays,
      restDays,
      description:
        `${trainingDays} training day${trainingDays === 1 ? '' : 's'} and ${restDays} rest day${restDays === 1 ? '' : 's'} a week. ` +
        `The rhythm stays steady so it fits around a real life — the work inside it does not.`,
    },
    equipment,
    commitment,
    totalSessions,
    includes: [
      'Every session written out in full, in order, ready to follow',
      'Progression handled for you — load and volume move as the weeks do',
      'Your place in the program remembered, session to session',
      'Calorie and macro targets calculated for your body and this goal',
      'Substitutions when you are short of equipment or working around a niggle',
      'Community channels and the PR wall alongside people running the same block',
    ],
    faq,
  };
}
