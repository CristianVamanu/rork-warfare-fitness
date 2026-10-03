import { collection, getDocs, orderBy, query, addDoc, deleteDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BreathTrack } from '@/types';

/**
 * The breathing soundtrack library.
 *
 * One track ships with the app (the original Breathwork Meditation piece,
 * in /public/audio); admins add more from the admin screen and members pick
 * one on the breathing setup screen. Uploaded files live in R2 and are
 * played through /api/media/audio so the browser sees a same-origin URL,
 * which is what lets the Web Audio volume control work on them.
 */
export const BUILT_IN_TRACK: BreathTrack = {
  id: 'built-in',
  title: 'Breathwork Meditation',
  url: '/audio/breathwork-meditation.mp3',
  durationSeconds: 223,
  order: 0,
};

export function playableUrl(track: BreathTrack): string {
  if (track.url.startsWith('/')) return track.url;
  return `/api/media/audio?src=${encodeURIComponent(track.url)}`;
}

export async function getBreathTracks(): Promise<BreathTrack[]> {
  const snap = await getDocs(query(collection(db, 'breathTracks'), orderBy('order', 'asc')));
  const uploaded = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BreathTrack, 'id'>) }));
  return [BUILT_IN_TRACK, ...uploaded];
}

export async function addBreathTrack(input: { title: string; url: string; durationSeconds?: number; order: number }): Promise<string> {
  const ref = await addDoc(collection(db, 'breathTracks'), { ...input, createdAt: serverTimestamp() });
  return ref.id;
}

export async function renameBreathTrack(id: string, title: string): Promise<void> {
  await updateDoc(doc(db, 'breathTracks', id), { title });
}

export async function removeBreathTrack(id: string): Promise<void> {
  await deleteDoc(doc(db, 'breathTracks', id));
}

/** Reads a file's duration in the browser without uploading it. */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? Math.round(a.duration) : undefined); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
      a.src = url;
    } catch { resolve(undefined); }
  });
}
