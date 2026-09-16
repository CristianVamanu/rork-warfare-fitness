/**
 * Ad-hoc activity — a run, a BJJ class, a five-a-side — logged outside the
 * program. The first thing a member asked for: "it can't record if I've
 * done something else". This is deliberately NOT a workout tracker. It is
 * one event with a type, a duration and a note, and it exists so training
 * outside the program counts toward the streak instead of breaking it.
 *
 * What it does not do, on purpose: it never advances the program pointer.
 * Alpha Bulk Day 9 is still Day 9 tomorrow. The program is the program;
 * this is everything else.
 */

export const ACTIVITY_TYPES = [
  { id: 'run',      label: 'Run' },
  { id: 'cycle',    label: 'Cycle' },
  { id: 'swim',     label: 'Swim' },
  { id: 'walk',     label: 'Walk / Hike' },
  { id: 'martial',  label: 'Martial arts' },
  { id: 'sport',    label: 'Sport' },
  { id: 'class',    label: 'Class' },
  { id: 'lift',     label: 'Other lifting' },
  { id: 'other',    label: 'Other' },
] as const;

export type ActivityTypeId = (typeof ACTIVITY_TYPES)[number]['id'];

export const ACTIVITY_MIN_MINUTES = 1;
export const ACTIVITY_MAX_MINUTES = 600;
export const ACTIVITY_NOTE_MAX = 200;
/** Ceiling on XP for one activity; mirrored in firestore.rules. */
export const ACTIVITY_XP_MAX = 150;

export function isActivityType(v: unknown): v is ActivityTypeId {
  return typeof v === 'string' && ACTIVITY_TYPES.some((t) => t.id === v);
}

export function activityLabel(id: string): string {
  return ACTIVITY_TYPES.find((t) => t.id === id)?.label ?? 'Activity';
}

/**
 * Flat, modest, capped. A program session earns up to a few hundred XP
 * from sets and load; an activity is self-reported with no evidence, so
 * it earns enough to feel counted and not enough to be worth faking.
 */
export function calcActivityXP(minutes: number): number {
  const safe = Number.isFinite(minutes) ? minutes : 0;
  const m = Math.max(0, Math.min(ACTIVITY_MAX_MINUTES, Math.round(safe)));
  return Math.min(ACTIVITY_XP_MAX, 20 + Math.round(m * 1.5));
}

export interface ActivityInput {
  type: ActivityTypeId;
  minutes: number;
  note?: string;
  /** 'YYYY-MM-DD' local; today when omitted. Not allowed in the future. */
  date?: string;
}

/** Validates and normalises what the sheet sends; returns a message on failure. */
export function validateActivity(input: ActivityInput, today: string): { ok: true; value: Required<Omit<ActivityInput, 'note'>> & { note: string } } | { ok: false; error: string } {
  if (!isActivityType(input.type)) return { ok: false, error: 'Pick an activity type.' };
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < ACTIVITY_MIN_MINUTES) return { ok: false, error: 'How long was it? Enter the minutes.' };
  if (minutes > ACTIVITY_MAX_MINUTES) return { ok: false, error: `Maximum is ${ACTIVITY_MAX_MINUTES} minutes in one entry.` };
  const note = (input.note ?? '').trim().slice(0, ACTIVITY_NOTE_MAX);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today;
  if (date > today) return { ok: false, error: 'That date is in the future.' };
  return { ok: true, value: { type: input.type, minutes, note, date } };
}
