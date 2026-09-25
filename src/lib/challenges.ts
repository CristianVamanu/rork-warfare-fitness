/**
 * Challenges: data access.
 *
 * challenges/{id}                 the brief, carousel, status, counters
 * challenges/{id}/entries/{uid}   one per member; the Enter button writes it
 * challenges/{id}/posts/{postId}  the feed; only entrants may write
 *
 * Kept out of firestore.ts on purpose — that file is the whole app's data
 * layer and this is a self-contained feature with its own rules block.
 */

import {
  doc, collection, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot, serverTimestamp, increment,
  arrayUnion, arrayRemove, deleteField, type UpdateData, type DocumentData,
} from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { db, auth } from './firebase';
import type { Challenge, ChallengeEntry, ChallengePost, ChallengeResultType, PostMedia } from '@/types';

/** Firestore rejects `undefined` values; every write below strips them. */
function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
function cleanMedia(list: PostMedia[] | undefined): PostMedia[] | undefined {
  return list?.map((m) => clean(m) as PostMedia);
}

// ── Reading ──────────────────────────────────────────────────────────────

/** Every challenge, newest first. Members filter out drafts client-side;
 *  the rules already hide drafts from non-admins, so the filter is belt
 *  and braces rather than the control. */
export async function getChallenges(): Promise<Challenge[]> {
  const snap = await getDocs(query(collection(db, 'challenges'), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Challenge);
}

export function subscribeChallenge(id: string, onUpdate: (c: Challenge | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    doc(db, 'challenges', id),
    (snap) => onUpdate(snap.exists() ? ({ id: snap.id, ...snap.data() } as Challenge) : null),
    (err) => onError?.(err),
  );
}

export function subscribeMyEntry(challengeId: string, uid: string, onUpdate: (e: ChallengeEntry | null) => void) {
  return onSnapshot(doc(db, 'challenges', challengeId, 'entries', uid), (snap) =>
    onUpdate(snap.exists() ? ({ id: snap.id, ...snap.data() } as ChallengeEntry) : null),
  );
}

/** All entries, for the board and the admin review list. Sorted here rather
 *  than by Firestore so no composite index is needed. */
export function subscribeEntries(challengeId: string, onUpdate: (list: ChallengeEntry[]) => void) {
  return onSnapshot(collection(db, 'challenges', challengeId, 'entries'), (snap) =>
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChallengeEntry)),
  );
}

export function subscribeChallengePosts(challengeId: string, onUpdate: (posts: ChallengePost[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'challenges', challengeId, 'posts'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, challengeId, ...d.data() }) as ChallengePost)),
    (err) => onError?.(err),
  );
}

// ── Members ──────────────────────────────────────────────────────────────

export async function enterChallenge(challengeId: string, user: { uid: string; displayName: string; photoURL?: string | null }) {
  await setDoc(doc(db, 'challenges', challengeId, 'entries', user.uid), clean({
    challengeId,
    userId: user.uid,
    displayName: user.displayName,
    photoURL: user.photoURL ?? undefined,
    status: 'entered',
    enteredAt: serverTimestamp(),
  }));
  // Best effort, same reasoning as channel postCount: the entry is what
  // matters and the rules allow exactly +1 here, but a network blip on the
  // counter must not read as "entering failed".
  await updateDoc(doc(db, 'challenges', challengeId), { entryCount: increment(1) }).catch(() => {});
}

/**
 * Turns a result into a number the board can sort. Time is "mm:ss" or
 * "h:mm:ss" to seconds; everything else is the first number in the text.
 * Returns undefined when nothing parses, and the entry still saves — an
 * unsortable result is a board problem, not a reason to lose someone's
 * submission.
 */
export function parseResultValue(type: ChallengeResultType, text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (type === 'done') return 1;
  if (type === 'time') {
    const parts = t.split(':').map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return undefined;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const m = t.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

export async function submitChallengeResult(
  challenge: Challenge,
  user: { uid: string; displayName: string; photoURL?: string | null; isAdmin?: boolean },
  input: { result: string; note?: string; proof: PostMedia[] },
) {
  const resultValue = parseResultValue(challenge.resultType, input.result);
  const proof = cleanMedia(input.proof) ?? [];
  await updateDoc(doc(db, 'challenges', challenge.id, 'entries', user.uid), clean({
    status: 'submitted',
    result: input.result.trim(),
    resultValue,
    proof,
    note: input.note?.trim() || undefined,
    submittedAt: serverTimestamp(),
  }));
  // The submission also lands in the feed as a result card, so the people
  // following the challenge see it where they are looking.
  await addDoc(collection(db, 'challenges', challenge.id, 'posts'), clean({
    challengeId: challenge.id,
    userId: user.uid,
    userDisplayName: user.displayName,
    userPhotoURL: user.photoURL ?? undefined,
    ...(user.isAdmin ? { userIsAdmin: true } : {}),
    content: input.note?.trim() ?? '',
    ...(proof.length ? { media: proof } : {}),
    submission: clean({ result: input.result.trim(), resultValue }),
    likes: [],
    createdAt: serverTimestamp(),
  }));
  await updateDoc(doc(db, 'challenges', challenge.id), { submissionCount: increment(1) }).catch(() => {});
}

export async function createChallengePost(
  challengeId: string,
  user: { uid: string; displayName: string; photoURL?: string | null; isAdmin?: boolean },
  input: { content: string; media?: PostMedia[] },
) {
  const media = cleanMedia(input.media);
  await addDoc(collection(db, 'challenges', challengeId, 'posts'), clean({
    challengeId,
    userId: user.uid,
    userDisplayName: user.displayName,
    userPhotoURL: user.photoURL ?? undefined,
    ...(user.isAdmin ? { userIsAdmin: true } : {}),
    content: input.content.trim(),
    ...(media?.length ? { media } : {}),
    likes: [],
    createdAt: serverTimestamp(),
  }));
}

export async function likeChallengePost(challengeId: string, postId: string, uid: string, liked: boolean) {
  await updateDoc(doc(db, 'challenges', challengeId, 'posts', postId), {
    likes: liked ? arrayUnion(uid) : arrayRemove(uid),
  });
}

export async function deleteChallengePost(challengeId: string, postId: string) {
  await deleteDoc(doc(db, 'challenges', challengeId, 'posts', postId));
}

// ── Admin ────────────────────────────────────────────────────────────────

export type ChallengeInput = Omit<Challenge, 'id' | 'entryCount' | 'submissionCount' | 'verifiedCount' | 'createdAt' | 'updatedAt' | 'createdBy'>;

export async function createChallenge(input: ChallengeInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, 'challenges'), {
    ...clean({ ...input, media: cleanMedia(input.media) ?? [] }),
    entryCount: 0,
    submissionCount: 0,
    verifiedCount: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateChallenge(id: string, patch: Partial<ChallengeInput>) {
  // A field the editor cleared should come off the document, not be left
  // as it was — undefined would be stripped, so use deleteField for the
  // optional ones.
  const data: UpdateData<DocumentData> = { ...clean(patch), updatedAt: serverTimestamp() };
  if (patch.media) data.media = cleanMedia(patch.media);
  for (const k of ['rules', 'category', 'loadoutMen', 'loadoutWomen', 'resultLabel', 'startsAt', 'endsAt'] as const) {
    if (k in patch && (patch[k] === undefined || patch[k] === '')) data[k] = deleteField();
  }
  await updateDoc(doc(db, 'challenges', id), data);
}

export async function deleteChallenge(id: string) {
  // Entries and posts stay behind as orphans; an admin route with
  // recursiveDelete is the proper fix and is on the Phase 2 list. Closing
  // is what the UI offers first, deleting is the destructive fallback.
  await deleteDoc(doc(db, 'challenges', id));
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  const token = await getIdToken(current);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** Verify or reject a submission. Verifying is what counts as finishing
 *  the challenge: XP, the badge, the board and the store gate all read
 *  it — so it runs on the server (api/admin/challenges/review), where the
 *  member's XP can be written and the push sent in the same breath. */
export async function reviewChallengeEntry(
  challenge: Pick<Challenge, 'id' | 'title'>,
  entry: Pick<ChallengeEntry, 'userId' | 'status'>,
  status: 'verified' | 'rejected',
  note?: string,
): Promise<{ xpDelta: number; newAchievements: string[] }> {
  return adminPost('/api/admin/challenges/review', { challengeId: challenge.id, userId: entry.userId, status, note });
}

/** "New challenge" push to every device, once per challenge. */
export async function announceChallenge(challengeId: string): Promise<{ sent?: number; alreadyAnnounced?: boolean }> {
  return adminPost('/api/admin/challenges/announce', { challengeId });
}

/** Grabs a still for every clip that has none, so a carousel never opens
 *  on a black frame (iOS paints nothing for a video before play). Waits a
 *  bounded time per clip; a clip that still has no poster saves without
 *  one rather than blocking the save. */
export async function ensurePosters(media: PostMedia[]): Promise<PostMedia[]> {
  const current = auth.currentUser;
  if (!current) return media;
  const token = await getIdToken(current);
  return Promise.all(media.map(async (m) => {
    if (m.type !== 'video' || m.posterURL) return m;
    try {
      const res = await fetch('/api/media/poster', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoUrl: m.url }),
        signal: AbortSignal.timeout(20_000),
      });
      const posterURL = res.ok ? ((await res.json()) as { posterUrl?: string | null }).posterUrl : null;
      return posterURL ? { ...m, posterURL } : m;
    } catch {
      return m;
    }
  }));
}

/** Lets a rejected entrant try again: back to 'entered' so Submit reopens. */
export async function reopenEntry(challengeId: string, uid: string) {
  await updateDoc(doc(db, 'challenges', challengeId, 'entries', uid), {
    status: 'entered',
    result: deleteField(), resultValue: deleteField(), proof: deleteField(), note: deleteField(),
    submittedAt: deleteField(), reviewedAt: deleteField(), reviewNote: deleteField(),
  });
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const snap = await getDoc(doc(db, 'challenges', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Challenge) : null;
}
