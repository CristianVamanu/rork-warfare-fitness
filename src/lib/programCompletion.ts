/**
 * Finishing a program — the moment, and whether to show it.
 *
 * A program ending used to be a dead end: the card said "Program complete",
 * the Start button vanished, and nothing else happened. On a monthly
 * subscription that is a cliff the product builds for itself — three months
 * of training, then a screen with nothing on it and no reason to open the
 * app tomorrow.
 *
 * So the end of a program becomes the one moment worth screenshotting: what
 * they actually did, a line they can post, and somewhere to go next.
 *
 * Pure on purpose. The same mistake has been made twice on this screen
 * already — logic derived inline in a component where nothing could assert
 * it, then quietly wrong for weeks (a lit flame for someone who had not
 * trained since March; six weekly bars filled on day one). Anything with a
 * rule in it lives here and is tested.
 */

export interface CompletionInput {
  /** dayProgress.finished — the program has run its full length. */
  finished: boolean;
  /** The active program's id. Undefined when nothing is active. */
  programId?: string;
  /** Programs this member has already been congratulated for. */
  celebrated?: string[];
  /** Sessions logged on this program. */
  sessionsDone: number;
}

/**
 * Show the moment once per program, ever.
 *
 * Keyed on the program id rather than a single boolean so finishing a
 * SECOND program celebrates again — a flat "hasCelebrated" flag would make
 * every completion after the first one silent, which is exactly backwards:
 * the second is harder than the first.
 *
 * Requires at least one logged session. Without that guard an empty program
 * — zero days, or a catalogue entry with no schedule — reads as instantly
 * "finished" and congratulates somebody for nothing, which is worse than
 * staying quiet.
 */
export function shouldCelebrate(input: CompletionInput): boolean {
  const { finished, programId, celebrated, sessionsDone } = input;
  if (!finished || !programId) return false;
  if (sessionsDone < 1) return false;
  return !(celebrated ?? []).includes(programId);
}

export interface CompletionStats {
  /** e.g. "91 days" */
  duration: string;
  sessions: string;
  /** Total tonnage, when there is any to show. */
  volume?: string;
}

export interface CompletionSummary {
  headline: string;
  /** The line that goes in the share sheet. */
  shareText: string;
  stats: CompletionStats[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Tonnage, in whichever unit the member reads weight in. */
function formatVolume(kg: number, unit: 'kg' | 'lbs'): string {
  const value = unit === 'lbs' ? kg * 2.20462 : kg;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}${unit === 'lbs' ? 'k lbs' : 't'}`;
  return `${Math.round(value)} ${unit}`;
}

export function completionSummary(args: {
  programName: string;
  totalDays: number;
  sessionsDone: number;
  totalVolumeKg?: number;
  weightUnit?: 'kg' | 'lbs';
}): CompletionSummary {
  const { programName, totalDays, sessionsDone, totalVolumeKg, weightUnit = 'kg' } = args;

  const stats: CompletionStats[] = [
    { duration: plural(totalDays, 'day'), sessions: plural(sessionsDone, 'session') },
  ];
  if (totalVolumeKg && totalVolumeKg > 0) {
    stats[0].volume = formatVolume(totalVolumeKg, weightUnit);
  }

  return {
    headline: `${programName}. Done.`,
    // States what was done and nothing else — no "crushed it", no
    // exclamation mark. The numbers are the brag; dressing them up reads
    // as the app congratulating itself rather than the member.
    shareText: `${plural(totalDays, 'day')}. ${plural(sessionsDone, 'session')}. ${programName} — complete.`,
    stats,
  };
}
