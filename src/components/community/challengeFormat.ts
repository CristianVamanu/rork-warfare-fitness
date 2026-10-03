import type { Challenge, ChallengeResultType } from '@/types';

/** Shared labels so the list, the detail page and the admin editor agree. */

export const RESULT_TYPES: { id: ChallengeResultType; label: string; unit: string; placeholder: string; hint: string }[] = [
  { id: 'time', label: 'Time', unit: '', placeholder: '14:32', hint: 'mm:ss — fastest wins' },
  { id: 'reps', label: 'Reps / rungs', unit: 'reps', placeholder: '20', hint: 'most wins' },
  { id: 'load', label: 'Load', unit: 'kg', placeholder: '100', hint: 'heaviest wins' },
  { id: 'distance', label: 'Distance', unit: 'km', placeholder: '12.5', hint: 'furthest wins' },
  { id: 'done', label: 'Done / not done', unit: '', placeholder: 'Done', hint: 'finishing is the result' },
];

export const DIFFICULTY: Record<Challenge['difficulty'], { label: string; bars: number }> = {
  standard: { label: 'Standard', bars: 1 },
  hard: { label: 'Hard', bars: 2 },
  brutal: { label: 'Brutal', bars: 3 },
};

export function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Ends in 3d", "Ended", "Starts Mon" — whichever is true. */
export function timeline(c: Challenge, now = new Date()): string | null {
  const start = toDate(c.startsAt), end = toDate(c.endsAt);
  if (c.status === 'closed') return 'Closed';
  if (start && start > now) return `Starts ${start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  if (end) {
    const days = Math.ceil((end.getTime() - now.getTime()) / 86400000);
    if (days < 0) return 'Ended';
    if (days === 0) return 'Ends today';
    return `Ends in ${days}d`;
  }
  return null;
}

/** Board order: time ascending, everything else descending. */
export function betterFirst(type: ChallengeResultType) {
  return (a: number, b: number) => (type === 'time' ? a - b : b - a);
}

/** Splits the list the way the tab shows it. A live challenge whose end
 *  date has passed reads as completed even before the admin closes it. */
export function bucket(c: Challenge, now = new Date()): 'live' | 'upcoming' | 'completed' | 'draft' {
  if (c.status === 'draft') return 'draft';
  if (c.status === 'closed') return 'completed';
  const start = toDate(c.startsAt), end = toDate(c.endsAt);
  if (start && start > now) return 'upcoming';
  if (end && end < now) return 'completed';
  return 'live';
}
