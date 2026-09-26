/**
 * Selection standards, and the arithmetic for judging yourself against them.
 *
 * Lifted out of the member PT test page so the public /standards pages read
 * exactly the same numbers. If those two ever disagreed about what Recon
 * requires, that is the kind of thing somebody screenshots.
 *
 * Two rules decide what is in here, and they are the reason the list looks
 * the way it does. A standard has to be testable in an ordinary gym, and it
 * has to have a real published number behind it. Everything a unit tests that
 * fails the first rule is named in `notTracked` rather than quietly dropped,
 * because a pass here is not a pass at selection and the page should never
 * let anyone believe otherwise.
 */

import type { PtTestResult } from '@/types';

export interface UnitStandard {
  id: string;
  flag: string;
  label: string;        // short toggle label
  resultTitle: string;  // shown on the result screen
  description: string;
  runLabel?: string;
  /** The bar. Meeting every one of these is what "passed" means here. */
  events: {
    pullups?: number;
    pushups?: number;      // 2-minute max unless the description says otherwise
    situps?: number;       // 2-minute max
    plankSeconds?: number; // held, not reps
    beepLevel?: number;    // 20m multi-stage shuttle (Luc Leger / bleep)
    runMinutes?: number;   // max allowed time for runLabel's distance
  };
  /**
   * What actually gets people selected, where it differs from the bar.
   *
   * Published minimums are an entry filter, not the standard the people who
   * ship are hitting — every source for every unit here says some version of
   * "candidates who only meet the minimum are gone in the first week". Showing
   * one number implied the minimum WAS the goal, which is the part that did
   * not reflect reality.
   */
  competitive?: {
    pullups?: number;
    pushups?: number;
    situps?: number;
    plankSeconds?: number;
    beepLevel?: number;
    runMinutes?: number;
  };
  /**
   * Per-event protocol, where this unit differs from the generic hint.
   *
   * The test's input labels are generic ("max in two minutes"), but the
   * protocols are not: the Army counts hand-release push-ups over two
   * minutes and the Coast Guard counts ordinary push-ups over one. Testing
   * yourself against the right number using the wrong protocol produces a
   * result that means nothing, so where a unit differs it says so on the
   * field itself.
   */
  eventHints?: Partial<Record<keyof UnitStandard['events'], string>>;
  /** Where the numbers come from, shown under the briefing. */
  source: string;
  /** Real selection events this app deliberately does not track. */
  notTracked?: string;
}

/**
 * Gym-testable selection standards, from published sources.
 *
 * Two rules for what belongs here. It has to be doable in a gym or on a
 * treadmill — no open water, no obstacle course, no loaded march over a
 * mountain — and it has to have a real published number behind it. Where a
 * unit's real test includes events that fail the first rule, they are named
 * in notTracked rather than quietly dropped, so nobody reads a pass here as
 * "I would pass selection".
 */
export const UNIT_STANDARDS: UnitStandard[] = [
  {
    id: 'recon',
    flag: '🇺🇸',
    label: 'Marine Recon',
    resultTitle: 'USMC Recon Selection (RSAT)',
    description:
      'The Recon Selection Aptitude Test target scores: 15 pull-ups, 60 push-ups and 85 crunches in two minutes each, and a 3-mile run inside 19:30. Marines who get picked up are usually well past that — 20 pull-ups, 80 push-ups, 100 crunches and a sub-18:00 three-mile.',
    runLabel: '3-Mile Run',
    events: { pullups: 15, pushups: 60, situps: 85, runMinutes: 19.5 },
    competitive: { pullups: 20, pushups: 80, situps: 100, runMinutes: 18 },
    source: 'RSAT target scores as published for Recon screening.',
    notTracked: '500m fin swim in cammies, 25m underwater, rifle retrieval and tow, 30-minute tread.',
  },
  {
    id: 'usmc-pft',
    flag: '🇺🇸',
    label: 'USMC PFT',
    resultTitle: 'Marine Corps PFT (300 score)',
    description:
      'The three events of the Marine PFT at full marks for a male aged 17 to 20: 23 pull-ups, a 3:45 plank, and a 3-mile run in 18:00. This is the base test every Marine takes, and the floor a Recon candidate builds on.',
    runLabel: '3-Mile Run',
    events: { pullups: 23, plankSeconds: 225, runMinutes: 18 },
    source: 'USMC PFT scoring tables, 100-point marks, male 17-20.',
    notTracked: 'The CFT — ammo can lifts, movement to contact, maneuver under fire.',
  },
  {
    id: 'seal',
    flag: '🇺🇸',
    label: 'SEAL Selection',
    resultTitle: 'Navy SEAL PST',
    description:
      'The Physical Screening Test minimums: 50 push-ups, 50 curl-ups, 10 pull-ups and a 1.5-mile run inside 10:30, each event in two minutes. The competitive column is what a contract actually goes to. Candidates who finish BUD/S tend to arrive nearer 100 push-ups, 100 sit-ups, 20 pull-ups and a nine-minute run.',
    runLabel: '1.5-Mile Run',
    events: { pushups: 50, situps: 50, pullups: 10, runMinutes: 10.5 },
    competitive: { pushups: 79, situps: 79, pullups: 11, runMinutes: 10 + 20 / 60 },
    source: 'Navy PST minimum and competitive score tables.',
    notTracked: '500-yard swim, sidestroke or breaststroke.',
  },
  {
    id: 'ranger',
    flag: '🇺🇸',
    label: 'Ranger (RASP)',
    resultTitle: 'Ranger Assessment (RASP)',
    description:
      'The RASP entry test: 53 push-ups, 63 sit-ups, 4 pull-ups and a 2-mile run inside 14:30. Inside the course the graded run is 5 miles in 40 minutes, and chin-ups are strict from a dead hang with no kip.',
    runLabel: '2-Mile Run',
    events: { pushups: 53, situps: 63, pullups: 4, runMinutes: 14.5 },
    competitive: { pushups: 80, situps: 90, pullups: 12, runMinutes: 13 },
    source: 'Pre-RASP entry standard, plus in-course graded events.',
    notTracked: '6-mile ruck with 35lb and weapon inside 1:30, building to 12 miles.',
  },
  {
    // Replaced the ACFT on 1 June 2025, so anything still published as "ACFT
    // standards" is describing a test the Army no longer runs.
    id: 'army-aft',
    flag: '🇺🇸',
    label: 'Army AFT',
    resultTitle: 'US Army Fitness Test (AFT)',
    description:
      'The Army\u2019s test of record since 1 June 2025, when it replaced the ACFT. Five events, each scored 0\u2013100. Every soldier must score at least 60 points per event; soldiers in combat specialties must also reach 350 points overall. The marks below are the 60-point minimum for a male aged 17\u201321, with the 100-point maximum alongside. Note these are HAND-RELEASE push-ups \u2014 hands lift clear of the deck at the bottom of every rep, which is materially harder than a standard press-up.',
    runLabel: '2-Mile Run',
    // Written as arithmetic rather than decimals so each figure can be read
    // straight off the official table: 19:57 and 13:22.
    events: { pushups: 15, plankSeconds: 90, runMinutes: 19 + 57 / 60 },
    competitive: { pushups: 58, plankSeconds: 220, runMinutes: 13 + 22 / 60 },
    eventHints: { pushups: 'Hand-release, max in two minutes' },
    source: 'AFT Score Tables, approved 15 May 2025, effective 1 June 2025, and Army Directive 2025-06 \u2014 60-point and 100-point marks, male 17\u201321.',
    notTracked: 'The three-rep max deadlift (150lb at 60 points, 340lb at 100) and the sprint-drag-carry (2:28 at 60 points) \u2014 both need a loaded bar, a sled and a measured lane.',
  },
  {
    id: 'pj',
    flag: '🇺🇸',
    label: 'PJ / Special Warfare',
    resultTitle: 'Air Force PJ Initial Fitness Test',
    description:
      'The calisthenics and run half of the Initial Fitness Test, formerly the PAST: 8 pull-ups, 40 push-ups, 50 sit-ups and a 1.5-mile run inside 10:20. Every event has to be cleared in one session — failing one fails the test.',
    runLabel: '1.5-Mile Run',
    events: { pullups: 8, pushups: 40, situps: 50, runMinutes: 10 + 20 / 60 },
    competitive: { pullups: 15, pushups: 65, situps: 75, runMinutes: 9.5 },
    source: 'Air Force Special Warfare IFT minimums.',
    notTracked: 'Two 25m underwater swims and a 500m surface swim, both gating.',
  },
  {
    // The one standard here an ordinary fit man can realistically clear
    // today, which makes it the honest entry point to the rest.
    id: 'uscg-boat-crew',
    flag: '\ud83c\uddfa\ud83c\uddf8',
    label: 'USCG Boat Crew',
    resultTitle: 'US Coast Guard Boat Crew',
    description:
      'The semi-annual physical fitness standard every Coast Guard boat crewmember has to hold to stay qualified \u2014 not a selection course, a proficiency requirement. Push-ups and sit-ups are each scored over ONE minute, not two. The marks below are for a male under 30. Every section must be completed in one sitting; fail one and the whole test is retaken.',
    runLabel: '1.5-Mile Run',
    events: { pushups: 29, situps: 38, runMinutes: 12 + 51 / 60 },
    eventHints: { pushups: 'Max in ONE minute', situps: 'Max in ONE minute' },
    source: 'Coast Guard Boat Operations and Training Manual, Table 4-5 \u2014 Physical Fitness Standards, male under 30.',
    notTracked: 'The 12-minute swim, which may be taken instead of the run: 500 yards for a male under 30.',
  },
  {
    id: 'commando',
    flag: '🇬🇧',
    label: 'Royal Marines',
    resultTitle: 'Potential Royal Marines Course',
    description:
      'The PRMC gym and track events. Three pull-ups keeps you on the course and eight is what candidates are told to arrive with; full marks are 16 pull-ups, 60 press-ups and 85 sit-ups in two minutes each. The three-miler is 1.5 miles as a squad, then 1.5 miles best effort — that second half is the number here. The bleep test floor is level 11.',
    runLabel: '1.5-Mile Best Effort',
    events: { pullups: 8, pushups: 60, situps: 85, beepLevel: 11, runMinutes: 10.5 },
    competitive: { pullups: 16, beepLevel: 13 },
    source: 'PRMC scoring: minimum to remain, and the maximum-points marks.',
    notTracked: 'Endurance course, Tarzan assault course, bottom field pass-out.',
  },
  {
    id: 'sas',
    flag: '🇬🇧',
    label: 'UKSF Briefing',
    resultTitle: 'UKSF Briefing Course Fitness Test',
    description:
      'The fitness test on the five-day briefing course that precedes SAS selection proper: 45 press-ups and 55 sit-ups in two minutes each, and 1.5 miles inside 9:30. The run standard is the hard one — it is a minute faster than most military entry tests.',
    runLabel: '1.5-Mile Run',
    events: { pushups: 45, situps: 55, runMinutes: 9.5 },
    competitive: { pushups: 70, situps: 80, runMinutes: 9 },
    source: 'UKSF briefing course Combat Fitness Test.',
    notTracked: 'Hills phase, the Fan Dance, Endurance, and the swim and navigation tests.',
  },
  {
    id: 'legion',
    flag: '🇫🇷',
    label: 'Foreign Legion',
    resultTitle: 'French Foreign Legion Selection',
    description:
      'The Aubagne selection tests that convert to a gym: 4 pull-ups to pass, with 8 or more strongly recommended, and the Luc Léger shuttle test at level 7 minimum. The shuttle is the same 20m bleep test, starting at 8.5 km/h and rising half a km/h a level.',
    events: { pullups: 4, beepLevel: 7 },
    competitive: { pullups: 8, beepLevel: 10 },
    source: 'Legion recruiting centre published tests.',
    notTracked: 'Rope climb, psychotechnical and medical boards, the Gestapo interview.',
  },
  {
    id: 'spetsnaz',
    flag: '🇷🇺',
    label: 'Spetsnaz',
    resultTitle: 'Spetsnaz Selection Standard',
    description:
      'The commonly cited Spetsnaz selection numbers: 20 strict pull-ups, 90 push-ups in two minutes, and 3km inside 10:30. Treat these as indicative rather than official — unlike the Western units here, no verifiable published standard exists.',
    runLabel: '3km Run',
    events: { pullups: 20, pushups: 90, runMinutes: 10.5 },
    source: 'Widely repeated figures; no official public standard available.',
    notTracked: 'Hand-to-hand assessment and the final endurance march.',
  },
  {
    id: 'ksk',
    flag: '🇩🇪',
    label: 'KSK Selection',
    resultTitle: 'KSK Selection Fitness Test',
    description:
      'The KSK entry screen, where failing one event ends it. Seven strict overhand pull-ups from a dead hang, and then two short windows rather than the usual two minutes: 22 hand-release push-ups and 20 crunches, both inside 30 seconds. The run is five 1,000m intervals with three minutes between them, getting faster each round — 4:30, 4:20, 4:10, 4:00, and a last one under 3:50. That final rep is the number scored here, because it is the one that fails people.',
    runLabel: '1,000m (final interval)',
    events: { pullups: 7, pushups: 22, situps: 20, runMinutes: 3 + 50 / 60 },
    source: 'KSK selection minimums: fail one event and you are out.',
    notTracked: '200m combat swim in uniform, the 20km speed march with 20kg, the obstacle course and close-combat rounds.',
  },
  {
    id: 'commando-pjfa',
    flag: '🇬🇧',
    label: 'RM Entry Test',
    resultTitle: 'Royal Marines Pre-Joining Fitness Assessment',
    description:
      'The first Royal Marines gate, before the PRMC. A bleep test to level 10.8, then press-ups, sit-ups and pull-ups performed to the bleep rather than against a clock. The published pass marks are 30 press-ups, 40 sit-ups and 4 pull-ups. They look modest next to the PRMC numbers because they are meant to: this is the test that says you are fit enough to be assessed, not fit enough to pass.',
    events: { pullups: 4, pushups: 30, situps: 40, beepLevel: 10.8 },
    competitive: { pullups: 8, pushups: 60, situps: 85, beepLevel: 11 },
    source: 'Royal Navy published PJFA / Candidate Preparation Course standards.',
    notTracked: 'Nothing — this one is entirely gym-testable, which is the point of it.',
  },
  {
    id: 'romania',
    flag: '🇷🇴',
    label: 'Romanian SOF',
    resultTitle: 'Romanian Special Operations Selection',
    description:
      'The assessment module for Romanian Forțele pentru Operații Speciale, the standard candidates are held to before certifying as paratroopers, divers or combat climbers. Eight to ten strict dead-hang pull-ups, 45 to 50 push-ups and 50 to 60 crunches in two minutes each, and 3,000m slick inside 12:30. The lower end of each range is the bar below; the upper end is what actually gets people through.',
    runLabel: '3,000m Run',
    events: { pullups: 8, pushups: 45, situps: 50, runMinutes: 12.5 },
    competitive: { pullups: 10, pushups: 50, situps: 60 },
    source: 'Romanian SOF assessment module maximum-effort standards.',
    notTracked: 'The water survival and combat swimming test, 15–20km loaded marches with 20kg+, and the multi-day attrition phase.',
  },
];

export function standardFor(id?: string): UnitStandard | undefined {
  return UNIT_STANDARDS.find((s) => s.id === id);
}

/**
 * The standard a member's own program trains toward.
 *
 * The two lists were unconnected: someone running Commando Prep opened this
 * page, saw ten unit names in no particular order with the generic test
 * preselected, and had to know which one their own program was for. Matching
 * on the program NAME rather than its id on purpose — the built-in ids (p5,
 * p8, …) stop applying the moment an admin edits a program into Firestore or
 * writes a new one, and the name is what survives.
 */
export const PROGRAM_STANDARD: { test: RegExp; standard: string }[] = [
  { test: /commando/i, standard: 'commando' },
  { test: /\bpjfa\b/i, standard: 'commando-pjfa' },
  { test: /romanian?|\bfos\b/i, standard: 'romania' },
  { test: /spetsnaz/i, standard: 'spetsnaz' },
  { test: /\bsas\b|special air service/i, standard: 'sas' },
  { test: /\bksk\b/i, standard: 'ksk' },
  { test: /ranger|rasp/i, standard: 'ranger' },
  { test: /\bseal\b|bud\/?s/i, standard: 'seal' },
  { test: /recon/i, standard: 'recon' },
  { test: /legion/i, standard: 'legion' },
  { test: /\bpj\b|pararescue|indoc/i, standard: 'pj' },
  // Last, so "Force Recon" still resolves to the Recon screener above rather
  // than to the base Marine test that every Marine takes.
  { test: /marine|usmc/i, standard: 'usmc-pft' },
];

export function standardForProgram(programName?: string): string | undefined {
  if (!programName) return undefined;
  return PROGRAM_STANDARD.find((m) => m.test.test(programName))?.standard;
}

// Simplified 0-100 benchmark scale per event, loosely modeled on published
// (unclassified) military PT test ranges for a young-adult male baseline —
// NOT an official/exact Army ACFT or Marine PFT score, which are banded by
// age and sex with far more precision. Good enough to track your own
// progress over time and get an honest sense of where you stand. Only used
// for the "Generic PT Test" mode; unit-standard mode compares directly
// against that unit's real published numbers instead.
export function scorePushups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 80) * 100)));
}
export function scoreSitups(reps: number): number {
  return Math.max(0, Math.min(100, Math.round((reps / 100) * 100)));
}
export function scoreRun(minutes: number, distance: 1.5 | 2): number {
  const worst = distance === 1.5 ? 15 : 20;
  const best = distance === 1.5 ? 9 : 12;
  const pct = (worst - minutes) / (worst - best);
  return Math.max(0, Math.min(100, Math.round(pct * 100)));
}
export function tierFor(total: number): PtTestResult['tier'] {
  if (total >= 275) return 'elite';
  if (total >= 225) return 'strong';
  if (total >= 150) return 'solid';
  return 'needs-work';
}
export const TIER_LABEL: Record<PtTestResult['tier'], { label: string; color: string }> = {
  elite: { label: 'Elite', color: 'text-accent' },
  strong: { label: 'Strong', color: 'text-green-400' },
  solid: { label: 'Solid', color: 'text-blue-400' },
  'needs-work': { label: 'Needs Work', color: 'text-yellow-400' },
};

/** 225 -> "3:45". Plank targets are published in minutes and seconds. */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const sec = Math.round(total % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatMinutes(mins: number): string {
  return `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, '0')}`;
}


// ── Public pages ───────────────────────────────────────────────────────────

/**
 * URL slugs, kept apart from the internal ids.
 *
 * The ids are short because they are typed in code; these are what a stranger
 * sees in the address bar and what a search engine indexes, so they are spelled
 * the way somebody would search for them. Changing one breaks every link ever
 * shared, so treat them as permanent.
 */
export const STANDARD_SLUGS: Record<string, string> = {
  'recon': 'marine-recon',
  'usmc-pft': 'usmc-pft',
  'seal': 'navy-seal',
  'ranger': 'army-ranger',
  'pj': 'air-force-pj',
  'uscg-boat-crew': 'coast-guard-boat-crew',
  'commando': 'royal-marines',
  'sas': 'uk-special-forces',
  'legion': 'french-foreign-legion',
  'army-aft': 'army-fitness-test',
  'spetsnaz': 'spetsnaz',
  'ksk': 'german-ksk',
  'commando-pjfa': 'royal-marines-entry-test',
  'romania': 'romanian-special-forces',
};

export function slugFor(id: string): string {
  return STANDARD_SLUGS[id] ?? id;
}

export function standardBySlug(slug: string): UnitStandard | undefined {
  const id = Object.keys(STANDARD_SLUGS).find((k) => STANDARD_SLUGS[k] === slug);
  return id ? standardFor(id) : standardFor(slug);
}

/**
 * Why the list of events is what it is.
 *
 * Shown on every public page, because the honest version of this product is
 * the one that says plainly what it cannot measure. Somebody who passes every
 * number here and then reads that a real course also involves a 500m swim in
 * boots has learned something true. Somebody who is allowed to believe a pass
 * here means a pass there has been misled, and will find out expensively.
 */
export const WHY_GYM_ONLY = {
  heading: 'Why these events and not others',
  body:
    'Every number here can be tested in an ordinary gym, on a track or on a treadmill, and every one has a published source behind it. '
    + 'Real selection also involves swimming in boots and clothing, obstacle and endurance courses, loaded marches over open ground, '
    + 'navigation, and assessment that has nothing to do with fitness at all. Those are left out because you cannot reproduce them safely '
    + 'or honestly on your own, not because they do not matter. Where a unit tests them, they are named on that unit’s page.',
  caveat:
    'Passing everything here does not mean you would pass selection. It means you would not be sent home on the fitness test.',
};
