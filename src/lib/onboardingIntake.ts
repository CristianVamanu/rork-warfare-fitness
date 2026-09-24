import type { FitnessGoal, ExperienceLevel, EquipmentType } from '@/types';

/**
 * The intake: the questions around the matcher, and the words on the reveal.
 *
 * The matcher still runs on exactly the answers it always did — goal,
 * experience, days, equipment, sex, age and the weight-goal timeline. The
 * questions added here (who you are, what you do, what stopped you, what
 * you would prioritise) are saved to the profile and used for the copy
 * on the reveal and for segmenting email, and for nothing else. That is
 * deliberate: a longer quiz raises commitment before the reveal, but it
 * must not change which program someone is handed, or the matching that
 * was tuned and tested stops meaning what it meant.
 *
 * Pure. Tested without a browser.
 */

export type TrainingFor = 'selection' | 'active-duty' | 'first-responder' | 'hybrid' | 'comeback';
export type Occupation = 'military-combat' | 'military-support' | 'police' | 'fire-ems' | 'preparing' | 'civilian' | 'prefer-not';
export type Blocker = 'hopping' | 'falling-off' | 'no-time' | 'injuries' | 'alone';
export type Priority = 'strength' | 'running' | 'size' | 'rucking' | 'swimming';

export interface Choice<T extends string> { value: T; label: string; sub: string }

export const TRAINING_FOR: Choice<TrainingFor>[] = [
  { value: 'selection', label: 'A selection course', sub: 'BUD/S, SFAS, RASP, Ranger School, Commando, UKSF and every pipeline like them.' },
  { value: 'active-duty', label: 'Active military readiness', sub: 'In uniform. Staying mission-ready.' },
  { value: 'first-responder', label: 'First responder', sub: 'Police, fire, EMS, corrections. Fit for the shift, whatever it brings.' },
  { value: 'hybrid', label: 'Hybrid and functional fitness', sub: 'Run, lift, and do it all well. No uniform required. Same standard.' },
  { value: 'comeback', label: 'The comeback', sub: 'Years off, injury, age or life got in the way. Rebuild to the standard.' },
];

export const OCCUPATIONS: Choice<Occupation>[] = [
  { value: 'military-combat', label: 'Military: combat role', sub: 'Infantry, armour, combat arms.' },
  { value: 'military-support', label: 'Military: support role', sub: 'Logistics, medical, technical, admin.' },
  { value: 'police', label: 'Police / law enforcement', sub: 'Patrol, tactical, corrections, federal.' },
  { value: 'fire-ems', label: 'Fire / EMS', sub: 'Firefighter, paramedic, rescue.' },
  { value: 'preparing', label: 'Preparing to enlist or select', sub: 'Not in yet. Training toward the pipeline.' },
  { value: 'civilian', label: 'Civilian', sub: 'Any other job. Same standard.' },
  { value: 'prefer-not', label: 'Prefer not to say', sub: 'Skip it. Your program does not change.' },
];

/** Same three levels the matcher has always used, described as situations. */
export const EXPERIENCE_CHOICES: Choice<ExperienceLevel>[] = [
  { value: 'beginner', label: 'New, or returning after years off', sub: 'No recent training base. Less than a year of consistent work.' },
  { value: 'intermediate', label: 'Train regularly but feel stuck', sub: 'One to three years in. Plateauing, going through the motions.' },
  { value: 'advanced', label: 'Solid all-around, want a better system', sub: 'Three years or more. Train hard, want structured progression.' },
];

export const EQUIPMENT_CHOICES: Choice<EquipmentType>[] = [
  { value: 'full-gym', label: 'Full gym access', sub: 'Barbell, racks, machines. Commercial gym or a fully kitted home gym.' },
  { value: 'home', label: 'Home gym basics', sub: 'Dumbbells, kettlebell, bands, a ruck. Some weights, no barbell rack.' },
  { value: 'minimal', label: 'Bodyweight only', sub: 'No gym, no equipment. Deployed, travelling, or home with nothing but a pull-up bar.' },
];

export const BLOCKERS: Choice<Blocker>[] = [
  { value: 'hopping', label: 'Program-hopping and guesswork', sub: 'New plan every month. No through-line.' },
  { value: 'falling-off', label: 'Falling off after two or three weeks', sub: 'Strong starts. Weak week fours.' },
  { value: 'no-time', label: 'Shift work, no time', sub: 'The schedule eats the plan alive.' },
  { value: 'injuries', label: 'Injuries keep resetting me', sub: 'Train hard, break, restart. Repeat.' },
  { value: 'alone', label: 'Training alone, no accountability', sub: 'Nobody checking the work.' },
];

export const PRIORITIES: Choice<Priority>[] = [
  { value: 'strength', label: 'Strength', sub: 'Move heavy. Squat, bench, deadlift, carry.' },
  { value: 'running', label: 'Running', sub: 'Cut your time or add distance.' },
  { value: 'size', label: 'Size', sub: 'Add muscle. Functional armour for the job.' },
  { value: 'rucking', label: 'Rucking', sub: 'Load on your back, miles under you.' },
  { value: 'swimming', label: 'Swimming', sub: 'Water confidence and engine.' },
];

const TRAINING_FOR_VALUES = new Set(TRAINING_FOR.map((c) => c.value));
const OCCUPATION_VALUES = new Set(OCCUPATIONS.map((c) => c.value));
const BLOCKER_VALUES = new Set(BLOCKERS.map((c) => c.value));
const PRIORITY_VALUES = new Set(PRIORITIES.map((c) => c.value));

export const isTrainingFor = (v: unknown): v is TrainingFor => typeof v === 'string' && TRAINING_FOR_VALUES.has(v as TrainingFor);
export const isOccupation = (v: unknown): v is Occupation => typeof v === 'string' && OCCUPATION_VALUES.has(v as Occupation);
export const isBlocker = (v: unknown): v is Blocker => typeof v === 'string' && BLOCKER_VALUES.has(v as Blocker);
export const isPriority = (v: unknown): v is Priority => typeof v === 'string' && PRIORITY_VALUES.has(v as Priority);

/**
 * The human label for a stored intake answer, for the admin client card.
 * Unknown or missing values come back as null so the caller can show a dash.
 */
export function intakeAnswerLabel(field: 'trainingFor' | 'occupation' | 'blocker' | 'priority', value: unknown): string | null {
  const list: readonly Choice<string>[] =
    field === 'trainingFor' ? TRAINING_FOR : field === 'occupation' ? OCCUPATIONS : field === 'blocker' ? BLOCKERS : PRIORITIES;
  return list.find((c) => c.value === value)?.label ?? null;
}

/**
 * The break screen between questions: the program taking shape from the
 * six answers already given. Each row is one answer turned into a decision
 * about the training (what the sessions are built around, how the load
 * moves, what the week looks like, what kit it assumes) plus an honest
 * expectation for the first weeks. Nothing here feeds the matcher; it is a
 * read-back, so it can never promise a program the matcher will not hand
 * over.
 */
export interface IntelBreak {
  eyebrow: string;
  title: string;
  rows: { label: string; value: string; why: string }[];
  /** What the next questions still decide. */
  note: string;
}

export function intelBreakFor(a: {
  trainingFor: TrainingFor | null;
  goal: FitnessGoal | null;
  experience: ExperienceLevel | null;
  trainingDays: number | null;
  equipment: EquipmentType | null;
}): IntelBreak {
  const rows: IntelBreak['rows'] = [];

  const focus: Record<FitnessGoal, [string, string]> = {
    'lose-fat': ['Conditioning-led, strength kept', 'Fat comes off in a deficit. The lifting stays so what comes off is fat, not muscle.'],
    'build-muscle': ['Hypertrophy blocks', 'Higher volume, controlled tempo, progressive load. Size follows tonnage over weeks.'],
    'strength': ['Heavy compounds first', 'Squat, press, pull and carry at the top of every session, accessories after.'],
    'recomposition': ['Strength plus engine', 'Lift heavy enough to hold muscle, condition hard enough to strip fat. Both, every week.'],
    'military-prep': ['Test events trained directly', 'Push-ups, pull-ups, sit-ups, runs and rucks are on the program, not left to chance.'],
  };
  if (a.goal) rows.push({ label: 'Built around', value: focus[a.goal][0], why: focus[a.goal][1] });
  else if (a.trainingFor === 'selection' || a.trainingFor === 'active-duty') rows.push({ label: 'Built around', value: 'Test events trained directly', why: 'The scored events are on the program, not left to chance.' });

  const prog: Record<ExperienceLevel, [string, string]> = {
    beginner: ['Technique first, then load every week', 'A new lifter progresses fast. The program adds weight or reps weekly while the form is bedded in.'],
    intermediate: ['Planned waves, no plateaus', 'Volume and intensity move in blocks, so the stall you have hit does not repeat.'],
    advanced: ['Periodised blocks', 'Accumulate, intensify, deload. Structured progression instead of another hard week.'],
  };
  if (a.experience) rows.push({ label: 'Progression', value: prog[a.experience][0], why: prog[a.experience][1] });

  if (a.trainingDays) {
    const d = a.trainingDays;
    // Days are a matching input, not a promise about the split: the best-fit
    // program may train fewer days than offered (one muscle program in a
    // catalogue, a six-day lifter). Say what the number does, not what the
    // week will look like.
    const words = ['', '', '', 'Three', 'Four', 'Five', 'Six'][Math.min(6, Math.max(3, d))];
    const week = `${words} days on the table`;
    const why = d <= 3 ? 'Programs that fit three days are full-body by design. Recovery days between do the growing.'
      : d === 4 ? 'Four is the sweet spot for most programs: each pattern trained twice a week.'
      : 'Matched to programs built for that volume. If the best fit trains fewer days, the rest days are real rest, not a gap.';
    rows.push({ label: 'Your week', value: week, why });
  }

  const kit: Record<EquipmentType, [string, string]> = {
    'full-gym': ['Barbell and machines used', 'Loading is precise and progression is measurable in load.'],
    'home': ['Dumbbells, kettlebell, bands', 'Home kit is enough when the program is written for it. No substitutions on day one.'],
    'minimal': ['Bodyweight and a pull-up bar', 'Progress comes from density, tempo and harder variations, not from a rack you do not have.'],
  };
  if (a.equipment) rows.push({ label: 'Kit assumed', value: kit[a.equipment][0], why: kit[a.equipment][1] });

  const expect: Record<FitnessGoal, string> = {
    'lose-fat': 'Half to one percent of bodyweight a week is the sustainable rate. Faster than that costs muscle.',
    'build-muscle': 'Strength climbs within two weeks. Visible size takes six to eight. Both are logged so you see it.',
    'strength': 'Beginners add to the bar most weeks. Past that, expect steady monthly PRs, not daily ones.',
    'recomposition': 'The scale moves slowly by design. Measurements, photos and lifts tell the real story.',
    'military-prep': 'Push-up and run scores move first, usually inside four weeks. Pull-ups take the longest.',
  };
  if (a.goal) rows.push({ label: 'First weeks', value: 'What to expect', why: expect[a.goal] });

  return {
    eyebrow: 'Taking shape',
    title: rows.length >= 3 ? 'Here is how your program is being built.' : 'Here is what we know so far.',
    rows,
    note: 'Three questions left. What stopped you before and what you would prioritise shape how the program is coached. Your body stats fix the exact match and set your nutrition targets.',
  };
}

/**
 * A program name short enough to sit inside a sentence. "Cali 6: Level
 * Warrior Calisthenics Program" becomes "Cali 6"; "Alpha Bulk" is untouched.
 * The full name still shows on the match card underneath.
 */
export function shortProgramName(name: string): string {
  const cut = name.split(/\s[:\u2013\u2014-]\s|:\s/)[0].trim();
  const stripped = cut.replace(/\s+(program|programme|plan)$/i, '').trim();
  return stripped || name;
}

/** The word after "you're a": what the goal says about the person. */
export function athleteLabel(goal: FitnessGoal | null, trainingFor: TrainingFor | null): string {
  if (goal === 'military-prep') return 'Selection';
  if (goal === 'strength') return 'Strength';
  if (goal === 'build-muscle') return 'Muscle-Building';
  if (goal === 'lose-fat') return 'Fat-Loss';
  if (trainingFor === 'hybrid') return 'Hybrid';
  return 'Recomp';
}

export function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

const GOAL_WANT: Record<FitnessGoal, string> = {
  'military-prep': 'to pass a PT test and be ready for selection',
  'lose-fat': 'to lose fat and keep the muscle',
  'build-muscle': 'to build muscle',
  recomposition: 'to build muscle and lose fat at the same time',
  strength: 'to get stronger',
};

const EQUIPMENT_FIT: Record<EquipmentType, string> = {
  'full-gym': 'Written for a full gym: barbell, racks and machines, the way you train.',
  home: 'Runs on home-gym basics: dumbbells, a kettlebell, bands. No commercial gym required.',
  minimal: 'Runs on bodyweight and a pull-up bar. Deployed, travelling or at home, the session is still there.',
};

const EXPERIENCE_FIT: Record<ExperienceLevel, string> = {
  beginner: 'Starts where you actually are. Week one is a base, not a beatdown, and the loads only move when your logs say so.',
  intermediate: 'Built to break a plateau: phased blocks that change every few weeks, so the body cannot settle into the old routine.',
  advanced: 'Structured progression, not more volume. Each block builds on the last, and the app decides the next load from your last one.',
};

const BLOCKER_FIT: Record<Blocker, string> = {
  hopping: 'One program, one through-line. It is planned to the end, so there is nothing to hop to.',
  'falling-off': 'The app counts every day, rest days included. Week four is visible before it becomes a problem.',
  'no-time': 'Sessions are fixed and short enough to fit a shift. Miss one and the program moves, it does not reset.',
  injuries: 'Progression comes from your logs, not a calendar, so a bad week never forces a jump you are not ready for.',
  alone: 'Your streak and your sessions are on the home screen every time you open it. Members post theirs. It shows.',
};

/**
 * Three reasons this program fits, built from what the person said.
 * Always three, always in the same order: the goal, the kit, then the
 * situation. Nothing invented about the program itself; the program's own
 * commitment line is used where it exists.
 */
export function whyThisFits(a: {
  goal: FitnessGoal | null;
  equipment: EquipmentType | null;
  experience: ExperienceLevel | null;
  trainingDays: number | null;
  blocker: Blocker | null;
  programName: string;
  commitment?: string;
}): string[] {
  const out: string[] = [];
  if (a.goal) out.push(`You said you want ${GOAL_WANT[a.goal]}. ${a.programName} is built for exactly that, in phased blocks that change as you progress.`);
  if (a.equipment) out.push(EQUIPMENT_FIT[a.equipment]);
  if (a.blocker) out.push(BLOCKER_FIT[a.blocker]);
  else if (a.experience) out.push(EXPERIENCE_FIT[a.experience]);
  if (out.length < 3 && a.commitment) out.push(a.commitment);
  if (out.length < 3 && a.trainingDays) out.push(`${a.trainingDays} days a week, as you asked. Fewer days means more weeks, never a skipped session.`);
  return out.slice(0, 3);
}

/**
 * The offer, in words, from the membership settings. One place decides
 * what the button says and what the three boxes underneath say, so the
 * reveal can never promise terms the checkout does not honour.
 */
export interface OfferWords {
  kind: 'paid-trial' | 'card-trial' | 'free-trial' | 'subscribe' | 'none';
  button: string;
  line: string;
  boxes: { title: string; body: string }[];
  /** True when pressing the button should go to checkout after the account exists. */
  checkout: boolean;
}

export function offerWords(cfg: {
  enabled?: boolean;
  trialDays?: number;
  paidTrialEnabled?: boolean;
  trialPriceCents?: number;
  cardUpFrontTrial?: boolean;
} | null | undefined, plan: { price: number; months: number } | null): OfferWords {
  if (!cfg?.enabled || !plan) {
    return { kind: 'none', button: 'Start training', line: '', boxes: [], checkout: false };
  }
  const per = plan.months === 1 ? '/mo' : ` / ${plan.months} months`;
  const price = `$${plan.price.toFixed(2)}${per}`;
  const days = cfg.trialDays ?? 0;
  if (cfg.paidTrialEnabled && days > 0) {
    const trial = `$${((cfg.trialPriceCents ?? 100) / 100).toFixed(2)}`;
    return {
      kind: 'paid-trial',
      button: `Start for ${trial}`,
      line: `${trial} today · then ${price} · cancel anytime`,
      boxes: [
        { title: 'Today', body: `${trial}. Full access. Your program loaded, day one ready.` },
        { title: `Days 1–${days}`, body: 'Train. Log. Cancel any time, in the app.' },
        { title: `Day ${days + 1}`, body: `${price} begins. Cancel before and ${trial} is all you paid.` },
      ],
      checkout: true,
    };
  }
  if (cfg.cardUpFrontTrial && days > 0) {
    return {
      kind: 'card-trial',
      button: `Start ${days} days free`,
      line: `Free for ${days} days · card required · then ${price} · cancel anytime`,
      boxes: [
        { title: 'Today', body: 'Card on file, nothing charged. Your program loaded.' },
        { title: `Days 1–${days}`, body: 'Train. Log. Cancel any time, in the app.' },
        { title: `Day ${days + 1}`, body: `${price} begins unless you cancelled.` },
      ],
      checkout: true,
    };
  }
  if (days > 0) {
    return {
      kind: 'free-trial',
      button: `Start ${days} days free`,
      line: `Free for ${days} days · no card · then ${price} if you stay`,
      boxes: [
        { title: 'Today', body: 'No card. Your program loaded, day one ready.' },
        { title: `Days 1–${days}`, body: 'Train. Log. Nothing to cancel.' },
        { title: `Day ${days + 1}`, body: `Pick a plan from ${price} to keep going.` },
      ],
      checkout: false,
    };
  }
  return {
    kind: 'subscribe',
    button: `Subscribe · ${price}`,
    line: `${price} · cancel anytime`,
    boxes: [
      { title: 'Today', body: 'Full access. Your program loaded, day one ready.' },
      { title: 'Every session', body: 'Logged, progressed, counted.' },
      { title: 'Any time', body: 'Cancel in the app. No calls, no forms.' },
    ],
    checkout: true,
  };
}

export const DEFAULT_WHY_PRICE =
  'A free month fills the app with people who never train. A dollar is not the price, it is the filter: it keeps the leaderboard honest and the community made of people who show up. If it is not for you, cancel in the app before the month ends and a dollar is all you paid.';

export const DEFAULT_OFFER_STACK: { title: string; body: string }[] = [
  { title: 'Your matched program', body: 'Phased blocks matched to your level and kit. Loads move with your logs.' },
  { title: 'Every program unlocked', body: 'Selection prep, strength, fat loss, muscle, over-50s. Switch from your training screen, progress kept.' },
  { title: 'Nutrition targets built for the program', body: 'Calories and macros set to your goal. Photograph a plate or scan a barcode to log it.' },
  { title: 'Standards tracking', body: 'PT test log scored against published standards, so you see the exact gap closing.' },
  { title: 'Streaks, community, reminders', body: 'It counts the days you skip too. Members post their weeks. Reminders arrive in the installed app.' },
];

/** Reads admin overrides for the reveal copy, with the defaults behind them. */
export function revealCopy(cfg: { onboardingCopy?: { whyPrice?: unknown; offerStack?: unknown } } | null | undefined): {
  whyPrice: string;
  offerStack: { title: string; body: string }[];
} {
  const o = cfg?.onboardingCopy ?? {};
  const whyPrice = typeof o.whyPrice === 'string' && o.whyPrice.trim() ? o.whyPrice.trim() : DEFAULT_WHY_PRICE;
  const stackRaw = Array.isArray(o.offerStack) ? o.offerStack : [];
  const offerStack = stackRaw
    .filter((s): s is { title: string; body: string } => !!s && typeof s === 'object' && typeof (s as { title?: unknown }).title === 'string' && (s as { title: string }).title.trim().length > 0)
    .map((s) => ({ title: s.title.trim(), body: typeof s.body === 'string' ? s.body.trim() : '' }));
  return { whyPrice, offerStack: offerStack.length ? offerStack : DEFAULT_OFFER_STACK };
}

/** The percentage on the progress bar. Never 100 before the reveal. */
export function intakePercent(step: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(95, Math.max(5, Math.round(((step + 1) / (total + 1)) * 100)));
}
