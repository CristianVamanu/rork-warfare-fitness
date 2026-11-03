'use client';

/**
 * Workouts finished without a connection.
 *
 * Finishing a workout runs a Firestore transaction (XP, streak), and
 * transactions need the server, so in a basement gym the save used to fail
 * and the member was left with an error. Now the finished workout is kept
 * on the phone and uploaded as soon as there is a connection, by the
 * flusher mounted in the app layout. Each entry carries a fixed event id,
 * so a retry after a half-finished upload never counts the workout twice
 * (completeWorkout checks for it first).
 */
import { doc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { completeWorkout } from '@/lib/actions';

export interface QueuedWorkout {
  eventId: string;
  uid: string;
  logs: Parameters<typeof completeWorkout>[1];
  duration: number;
  programId?: string;
  dayIndex?: number;
  unit: 'kg' | 'lbs';
  /** ms since epoch, when the member tapped finish. */
  finishedAt: number;
}

const KEY = 'wf-workout-outbox';

function read(): QueuedWorkout[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedWorkout[]; } catch { return []; }
}
function write(list: QueuedWorkout[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  try { window.dispatchEvent(new Event('wf-outbox')); } catch { /* not in a browser */ }
}

/** A new event id, made on the device (no network needed). */
export const newWorkoutEventId = () => doc(collection(db, 'events')).id;

export function queueWorkout(w: QueuedWorkout) {
  write([...read().filter((x) => x.eventId !== w.eventId), w]);
}

export function pendingWorkouts(uid: string): QueuedWorkout[] {
  return read().filter((x) => x.uid === uid);
}

/** True when an error means "no connection" rather than a real refusal. */
export function isOfflineError(e: unknown): boolean {
  const err = e as { code?: string; message?: string; name?: string };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return err?.code === 'unavailable' || err?.code === 'deadline-exceeded' || err?.name === 'OfflineTimeout'
    || /offline|network|failed to fetch|client is offline/i.test(err?.message ?? '');
}

let flushing = false;

/** Uploads everything queued for this member, oldest first. Returns how many went up. */
export async function flushWorkouts(uid: string): Promise<number> {
  if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const w of pendingWorkouts(uid).sort((a, b) => a.finishedAt - b.finishedAt)) {
      try {
        await completeWorkout(w.uid, w.logs, w.duration, w.programId, w.dayIndex, w.unit, {
          eventId: w.eventId,
          completedAt: new Date(w.finishedAt),
        });
        write(read().filter((x) => x.eventId !== w.eventId));
        sent++;
      } catch (e) {
        if (isOfflineError(e)) break; // try again on the next online event
        // A real refusal (rules, bad data) will never succeed: drop it rather
        // than retrying forever, and leave a trace for the error log.
        console.error('[Outbox] workout upload refused, dropping', e);
        write(read().filter((x) => x.eventId !== w.eventId));
      }
    }
  } finally { flushing = false; }
  return sent;
}
