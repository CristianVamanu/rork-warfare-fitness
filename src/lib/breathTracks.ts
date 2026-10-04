import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
 *
 * The list is one document, system/breathTracks, rather than a collection
 * of its own. The system documents are already covered by the published
 * security rules (members read, admins write), so this works the moment the
 * code deploys. The first version used a new collection, whose rule only
 * takes effect once the rules file is published separately; until then
 * every read was refused and the admin screen said it could not load the
 * tracks.
 */
export const BUILT_IN_TRACK: BreathTrack = {
  id: 'built-in',
  title: 'Breathwork Meditation',
  url: '/audio/breathwork-meditation.mp3',
  durationSeconds: 223,
  order: 0,
};

const ref = () => doc(db, 'system', 'breathTracks');

export function playableUrl(track: BreathTrack): string {
  if (track.url.startsWith('/')) return track.url;
  return `/api/media/audio?src=${encodeURIComponent(track.url)}`;
}

async function readUploaded(): Promise<BreathTrack[]> {
  const snap = await getDoc(ref());
  const list = (snap.exists() ? (snap.data().tracks as BreathTrack[] | undefined) : undefined) ?? [];
  return list.filter((t) => t && typeof t.url === 'string' && typeof t.title === 'string').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function writeUploaded(tracks: BreathTrack[]): Promise<void> {
  await setDoc(ref(), { tracks, updatedAt: serverTimestamp() }, { merge: true });
}

/** The built-in track first, then whatever admins uploaded. Never throws. */
export async function getBreathTracks(): Promise<BreathTrack[]> {
  try { return [BUILT_IN_TRACK, ...(await readUploaded())]; }
  catch { return [BUILT_IN_TRACK]; }
}

export async function addBreathTrack(input: { title: string; url: string; durationSeconds?: number }): Promise<string> {
  const current = await readUploaded();
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const track: BreathTrack = { id, title: input.title, url: input.url, order: current.length + 1, ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}) };
  await writeUploaded([...current, track]);
  return id;
}

export async function renameBreathTrack(id: string, title: string): Promise<void> {
  const current = await readUploaded();
  await writeUploaded(current.map((t) => (t.id === id ? { ...t, title } : t)));
}

export async function removeBreathTrack(id: string): Promise<void> {
  const current = await readUploaded();
  await writeUploaded(current.filter((t) => t.id !== id));
}

// ── Files ──────────────────────────────────────────────────────────────────

const EXT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
};

/** What the file picker accepts. Extensions as well as MIME types, because
 *  the iPhone Files app often reports an MP3 with no type at all, and an
 *  `accept` of only `audio/*` then greys it out. */
export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac';

/**
 * Returns the file with a usable audio content type, or null if it is not
 * audio. iOS frequently hands over an MP3 with an empty `type`; the upload
 * route requires an audio/* type, so it is filled in from the extension.
 */
export function asAudioFile(file: File): File | null {
  if (file.type.startsWith('audio/')) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = EXT_TYPES[ext];
  if (!type) return null;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Reads a file's duration in the browser without uploading it. */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = 'metadata';
      const done = (v?: number) => { URL.revokeObjectURL(url); resolve(v); };
      a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : undefined);
      a.onerror = () => done(undefined);
      setTimeout(() => done(undefined), 8000);
      a.src = url;
    } catch { resolve(undefined); }
  });
}
