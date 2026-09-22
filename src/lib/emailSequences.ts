/**
 * The marketing funnel: who gets which email, when, and how they stop it.
 *
 * Three fixed sequences, each a short list of steps at day offsets from a
 * trigger. The cron works out which step is due from two numbers — days
 * since the trigger and which steps have already gone — and stamps each
 * send on the document, so a step can never send twice however many times
 * the hour runs. Everything stops the moment the person does the thing
 * the sequence was nudging them toward.
 *
 * Consent and the exit are non-negotiable and live here too:
 *
 *   - Nothing marketing sends to someone who has opted out, and nothing
 *     sends at all unless an unsubscribe link can be signed. No secret, no
 *     marketing email — failing closed is the only acceptable failure.
 *   - The unsubscribe link is one click, needs no login, and is an HMAC of
 *     the address so it cannot be forged for someone else's inbox.
 *
 * Pure: no clock, no database. The cron passes numbers in; tests pin every
 * rule without either.
 */

export type SequenceKey = 'leadTips' | 'onboardingAbandon' | 'winBack';

export interface SequenceStep {
  key: string;
  /** Whole days after the trigger before this step may send. */
  day: number;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta: { label: string; path: string };
}

export interface SequenceDef {
  key: SequenceKey;
  label: string;
  description: string;
  steps: SequenceStep[];
}

/**
 * Copy is deliberately plain. These are the people who did NOT convert;
 * hype is what they already walked away from. Each email says one thing.
 */
export const SEQUENCES: Record<SequenceKey, SequenceDef> = {
  leadTips: {
    key: 'leadTips',
    label: 'Standards test follow-up',
    description: 'For visitors who took the test and ticked "send me tips". Three emails over ten days, then silence.',
    steps: [
      {
        key: 'd2', day: 2,
        subject: 'The gap between you and the standard',
        heading: 'Most people fail the same event.',
        paragraphs: [
          'The number you missed is not a fitness verdict — it is a training target. Selection standards are built to be trained for, and the gap closes faster than it looks from the outside.',
          'Your matched program is built around exactly that event. It starts where you are, not where the standard is.',
        ],
        cta: { label: 'See your program', path: '/onboarding' },
      },
      {
        key: 'd5', day: 5,
        subject: 'Three rules for your weakest event',
        heading: 'Fix the weak event first.',
        paragraphs: [
          'One: train it three times a week, never to failure. Two: add one rep or ten seconds every session, nothing more. Three: test it again in four weeks, not four days.',
          'That is the whole method. The program schedules it so you do not have to think about it.',
        ],
        cta: { label: 'Start the program', path: '/onboarding' },
      },
      {
        key: 'd10', day: 10,
        subject: 'Last one from us',
        heading: 'This is the last email about your result.',
        paragraphs: [
          'You took the test ten days ago. If you have started training for it, good — you do not need us. If you have not, the program is still matched to your answers and takes about four minutes to set up.',
          'Either way, we will not email you about this again.',
        ],
        cta: { label: 'Set up your program', path: '/onboarding' },
      },
    ],
  },
  onboardingAbandon: {
    key: 'onboardingAbandon',
    label: 'Account with no first workout',
    description: 'For members who created an account and never logged a session. Three emails over a week.',
    steps: [
      {
        key: 'd1', day: 1,
        subject: 'Your program is waiting',
        heading: 'Day one is the hardest to start.',
        paragraphs: [
          'Your program is set up and the first session is short on purpose. Twenty minutes, no equipment decisions, nothing to plan.',
        ],
        cta: { label: 'Open day one', path: '/training' },
      },
      {
        key: 'd3', day: 3,
        subject: 'One session is all it takes to start',
        heading: 'Do one. Just one.',
        paragraphs: [
          'Nobody has ever regretted a single workout. The streak, the flame, the program — all of it starts from one logged session, and the app carries the rest.',
        ],
        cta: { label: 'Start a session', path: '/training' },
      },
      {
        key: 'd7', day: 7,
        subject: 'Still here when you are ready',
        heading: 'No pressure. The plan keeps.',
        paragraphs: [
          'A week in and nothing logged — that is fine, life happens. Your program does not expire and does not judge. It will be exactly where you left it.',
          'This is the last reminder about starting. The rest is up to you.',
        ],
        cta: { label: 'Open the app', path: '/dashboard' },
      },
    ],
  },
  winBack: {
    key: 'winBack',
    label: 'Member gone quiet',
    description: 'For members who have not opened the app in a while. Three emails over two weeks, reset the moment they come back.',
    steps: [
      {
        key: 'd3', day: 3,
        subject: 'Three days off. Easy to fix.',
        heading: 'Three days is a break, not a stop.',
        paragraphs: [
          'Pick up the next session. The program advances from where you were — you have not lost a thing.',
        ],
        cta: { label: 'Next session', path: '/training' },
      },
      {
        key: 'd7', day: 7,
        subject: 'A week is where most people quit',
        heading: 'This is the week that decides it.',
        paragraphs: [
          'Most people who stop for a week never come back. The ones who do all did the same thing: one short session, nothing heroic, just to break the gap.',
        ],
        cta: { label: 'Do a short one', path: '/training' },
      },
      {
        key: 'd14', day: 14,
        subject: 'We will leave you alone after this',
        heading: 'Last nudge.',
        paragraphs: [
          'Two weeks without a session. If you are done, we understand, and this is the last email about it. If you are not, the program is exactly where you left it.',
        ],
        cta: { label: 'Open the app', path: '/dashboard' },
      },
    ],
  },
};

export interface SequenceToggles { leadTips: boolean; onboardingAbandon: boolean; winBack: boolean }

/** All on by default; the admin turns individual sequences off in Settings. */
export const SEQUENCE_DEFAULTS: SequenceToggles = { leadTips: true, onboardingAbandon: true, winBack: true };

/**
 * A path on this site: one leading slash, not two. `//host/x` is a
 * protocol-relative URL and would turn an email button into an external
 * link; `/\\host` is the same trick for some parsers.
 */
export function isSitePath(p: unknown): p is string {
  return typeof p === 'string' && /^\/(?![\/\\])/.test(p);
}

export function sequenceToggles(cfg: { emailSequences?: Partial<SequenceToggles> } | null | undefined): SequenceToggles {
  return { ...SEQUENCE_DEFAULTS, ...(cfg?.emailSequences ?? {}) };
}

/**
 * The single step that is due now, or null.
 *
 * Steps go in order and never skip: if the cron was down for a week, a
 * member three days quiet gets the day-3 email, not all three at once.
 * A step already stamped is never returned again.
 */
export function dueStep(seq: SequenceDef, daysSinceTrigger: number, sentKeys: Record<string, unknown> | undefined): SequenceStep | null {
  if (!Number.isFinite(daysSinceTrigger) || daysSinceTrigger < 0) return null;
  for (const step of seq.steps) {
    if (sentKeys?.[step.key]) continue;
    return daysSinceTrigger >= step.day ? step : null;
  }
  return null;
}

/** Whole days between two instants, floored. */
export function daysSince(thenMs: number, nowMs: number): number {
  return Math.floor((nowMs - thenMs) / (24 * 60 * 60 * 1000));
}

// ── Admin overrides ──────────────────────────────────────────────────────

/** What the admin may change on a step. Every field optional: absent = default. */
export interface StepOverride {
  enabled?: boolean;
  day?: number;
  subject?: string;
  heading?: string;
  paragraphs?: string[];
  ctaLabel?: string;
  ctaPath?: string;
}

export interface SequenceOverride {
  enabled?: boolean;
  steps?: Record<string, StepOverride>;
}

/** system/emailOverrides — one entry per sequence key. */
export type SequenceOverrides = Partial<Record<SequenceKey, SequenceOverride>>;

export interface ResolvedStep extends SequenceStep { enabled: boolean }
export interface ResolvedSequence extends Omit<SequenceDef, 'steps'> { enabled: boolean; steps: ResolvedStep[] }

/**
 * The built-in sequences with the admin's edits laid over them.
 *
 * Rules that keep an edit from breaking the funnel: a blank subject or
 * heading falls back to the default rather than sending an empty email; a
 * day offset must be a whole non-negative number; steps are re-sorted by
 * day after overrides so "never bunch up, never skip" still holds; and a
 * disabled step is simply removed from the list, which means the ones
 * after it still send on their own days.
 */
export function resolveSequences(overrides: SequenceOverrides | null | undefined, toggles: SequenceToggles = SEQUENCE_DEFAULTS): Record<SequenceKey, ResolvedSequence> {
  const out = {} as Record<SequenceKey, ResolvedSequence>;
  for (const def of Object.values(SEQUENCES)) {
    const ov = overrides?.[def.key];
    const enabled = typeof ov?.enabled === 'boolean' ? ov.enabled : toggles[def.key];
    const steps: ResolvedStep[] = def.steps.map((st) => {
      const o = ov?.steps?.[st.key] ?? {};
      const day = Number.isInteger(o.day) && (o.day as number) >= 0 ? (o.day as number) : st.day;
      const text = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
      const paragraphs = Array.isArray(o.paragraphs) && o.paragraphs.some((x) => typeof x === 'string' && x.trim())
        ? o.paragraphs.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
        : st.paragraphs;
      return {
        ...st,
        enabled: o.enabled !== false,
        day,
        subject: text(o.subject, st.subject),
        heading: text(o.heading, st.heading),
        paragraphs,
        cta: { label: text(o.ctaLabel, st.cta.label), path: isSitePath(text(o.ctaPath, st.cta.path)) ? text(o.ctaPath, st.cta.path) : st.cta.path },
      };
    }).filter((st) => st.enabled).sort((a, b) => a.day - b.day);
    out[def.key] = { key: def.key, label: def.label, description: def.description, enabled, steps };
  }
  return out;
}
