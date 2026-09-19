import { UNIT_STANDARDS, formatSeconds, formatMinutes, type UnitStandard } from './ptStandards';

/**
 * One test result, as a link somebody can post.
 *
 * The result screen is the most screenshot-worthy thing this product makes —
 * a man who has just found out he clears the USMC PFT wants to show someone —
 * and until now it lived only in React state, so there was nothing to send.
 *
 * Deliberately stateless. The scores travel in the URL, nothing is written
 * anywhere, and opening a shared link needs no account and no lookup. That
 * also means a shared link is exactly as private as the person who shared it
 * chose to make it: it carries the numbers they typed and nothing else — no
 * name, no email, no account, nothing that identifies them.
 *
 * The judging lives here rather than in the page so the shared link, the
 * live test and the generated image can never disagree about who passed.
 */

/** What the test collects. Strings because that is what the inputs hold. */
export interface Answers {
  pullups: string;
  pushups: string;
  situps: string;
  plank: string;
  beep: string;
  run: string;
}

export const EMPTY_ANSWERS: Answers = { pullups: '', pushups: '', situps: '', plank: '', beep: '', run: '' };

export interface Verdict {
  key: string;
  label: string;
  yours: string;
  target: string;
  passed: boolean;
  /** How far off, phrased for a human. Empty when they cleared it. */
  gap: string;
}

/** Minutes from "9:30" or "9.5". People type both. */
export function parseTime(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const mins = Number(m); const secs = Number(s);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return mins + secs / 60;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseNum(v: string): number | null {
  const n = Number(v.trim());
  return v.trim() && Number.isFinite(n) ? n : null;
}

/** Every event this unit tests, scored against the published bar. */
export function judge(standard: UnitStandard, a: Answers): Verdict[] {
  const out: Verdict[] = [];
  const e = standard.events;
  if (e.pullups !== undefined) {
    const yours = parseNum(a.pullups);
    out.push({
      key: 'pullups', label: 'Pull-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.pullups), passed: yours !== null && yours >= e.pullups,
      gap: yours !== null && yours < e.pullups ? `${e.pullups - yours} short` : '',
    });
  }
  if (e.pushups !== undefined) {
    const yours = parseNum(a.pushups);
    out.push({
      key: 'pushups', label: 'Push-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.pushups), passed: yours !== null && yours >= e.pushups,
      gap: yours !== null && yours < e.pushups ? `${e.pushups - yours} short` : '',
    });
  }
  if (e.situps !== undefined) {
    const yours = parseNum(a.situps);
    out.push({
      key: 'situps', label: 'Sit-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.situps), passed: yours !== null && yours >= e.situps,
      gap: yours !== null && yours < e.situps ? `${e.situps - yours} short` : '',
    });
  }
  if (e.plankSeconds !== undefined) {
    const yours = parseTime(a.plank);
    const yoursSec = yours === null ? null : yours * 60;
    out.push({
      key: 'plank', label: 'Plank', yours: yoursSec === null ? '—' : formatSeconds(yoursSec),
      target: formatSeconds(e.plankSeconds), passed: yoursSec !== null && yoursSec >= e.plankSeconds,
      gap: yoursSec !== null && yoursSec < e.plankSeconds ? `${Math.round(e.plankSeconds - yoursSec)}s short` : '',
    });
  }
  if (e.beepLevel !== undefined) {
    const yours = parseNum(a.beep);
    out.push({
      key: 'beep', label: 'Bleep test level', yours: yours === null ? '—' : String(yours),
      target: String(e.beepLevel), passed: yours !== null && yours >= e.beepLevel,
      gap: yours !== null && yours < e.beepLevel ? `${(e.beepLevel - yours).toFixed(1)} levels short` : '',
    });
  }
  if (e.runMinutes !== undefined) {
    const yours = parseTime(a.run);
    out.push({
      key: 'run', label: standard.runLabel ?? 'Run', yours: yours === null ? '—' : formatMinutes(yours),
      target: formatMinutes(e.runMinutes), passed: yours !== null && yours <= e.runMinutes,
      // Lower is better here, which is the one place the arithmetic flips.
      gap: yours !== null && yours > e.runMinutes ? `${formatMinutes(yours - e.runMinutes)} too slow` : '',
    });
  }
  return out;
}

/** Answered events only — an unattempted event is not a failure. */
export function summarise(verdicts: Verdict[]): {
  answered: number; passed: number; passedAll: boolean; failures: Verdict[];
} {
  const answered = verdicts.filter((v) => v.yours !== '—');
  const failures = answered.filter((v) => !v.passed);
  return {
    answered: answered.length,
    passed: answered.length - failures.length,
    // Every event tested, every one cleared. A partial attempt is never a pass.
    passedAll: verdicts.length > 0 && answered.length === verdicts.length && failures.length === 0,
    failures,
  };
}

/** Short keys, so a shared link stays short enough to post. */
const PARAM: Record<keyof Answers, string> = {
  pullups: 'pu', pushups: 'ps', situps: 'su', plank: 'pl', beep: 'bp', run: 'rn',
};

/** Only these characters ever appear in an answer: digits, colon, dot. */
const SAFE = /^[0-9:.]{1,8}$/;

export function encodeAnswers(a: Answers): string {
  const q = new URLSearchParams();
  for (const [k, param] of Object.entries(PARAM) as [keyof Answers, string][]) {
    const v = a[k].trim();
    if (v) q.set(param, v);
  }
  return q.toString();
}

/**
 * Read answers back out of a link.
 *
 * A shared URL is untrusted input that gets rendered into a page and an
 * image, so anything not matching the shape an answer can take is dropped
 * rather than displayed.
 */
export function decodeAnswers(get: (key: string) => string | null): Answers {
  const out = { ...EMPTY_ANSWERS };
  for (const [k, param] of Object.entries(PARAM) as [keyof Answers, string][]) {
    const raw = get(param);
    if (raw && SAFE.test(raw)) out[k] = raw;
  }
  return out;
}

/** The path a shared result lives at. */
export function resultPath(slug: string, a: Answers): string {
  const q = encodeAnswers(a);
  return `/standards/${slug}/result${q ? `?${q}` : ''}`;
}

/**
 * The line that goes on the image and in the share sheet.
 *
 * Passing is stated plainly. Falling short is stated as a distance, never as
 * a failure — the person sharing it is the one we are asking to keep going.
 */
export function verdictHeadline(standard: UnitStandard, verdicts: Verdict[]): string {
  const { answered, passedAll, failures } = summarise(verdicts);
  if (answered === 0) return `Could you pass ${standard.label}?`;
  if (passedAll) return `I passed the ${standard.label} standard.`;
  if (failures.length === 1) return `One event short of ${standard.label}.`;
  return `${failures.length} events short of ${standard.label}.`;
}

/** Known unit slugs, for validating a shared link's unit segment. */
export function isKnownUnit(slug: string, slugFor: (id: string) => string): boolean {
  return UNIT_STANDARDS.some((s) => slugFor(s.id) === slug || s.id === slug);
}
