/**
 * Member-side moderation: report a post/reply and block a member.
 *
 * Reports land in `reports/{id}` for the admins (Admin → Reports). Blocking
 * is a list on the member's own profile (`blockedUserIds`); everything that
 * blocked member writes is hidden from the blocker across community
 * channels, replies, challenge chats and the PR wall.
 */
import { addDoc, deleteField, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'other';
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam or scam' },
  { id: 'harassment', label: 'Bullying or harassment' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual', label: 'Nudity or sexual content' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'other', label: 'Something else' },
];

/** Where the reported content lives, so an admin can open or remove it. */
export type ReportTarget =
  | { kind: 'channelPost'; channelId: string; postId: string }
  | { kind: 'channelReply'; channelId: string; postId: string; replyId: string }
  | { kind: 'challengePost'; challengeId: string; postId: string }
  | { kind: 'prPost'; postId: string };

export interface ContentReport {
  id: string;
  target: ReportTarget;
  reason: ReportReason;
  note?: string;
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  /** A copy of the text at the time, so it can be judged even if edited. */
  excerpt: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: unknown;
}

export async function reportContent(input: {
  target: ReportTarget; reason: ReportReason; note?: string;
  reporterId: string; reportedUserId: string; reportedUserName: string; excerpt: string;
}) {
  await addDoc(collection(db, 'reports'), {
    target: input.target,
    reason: input.reason,
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 500) } : {}),
    reporterId: input.reporterId,
    reportedUserId: input.reportedUserId,
    reportedUserName: input.reportedUserName.slice(0, 80),
    excerpt: input.excerpt.slice(0, 500),
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

// The name is kept beside the id (blockedNames) because a member can't read
// another member's profile, and the Profile screen lists who you blocked.
export function blockUser(myUid: string, otherUid: string, otherName?: string) {
  return updateDoc(doc(db, 'users', myUid), {
    blockedUserIds: arrayUnion(otherUid),
    ...(otherName ? { [`blockedNames.${otherUid}`]: otherName.slice(0, 80) } : {}),
  });
}
export function unblockUser(myUid: string, otherUid: string) {
  return updateDoc(doc(db, 'users', myUid), { blockedUserIds: arrayRemove(otherUid), [`blockedNames.${otherUid}`]: deleteField() });
}

// ── Admin ────────────────────────────────────────────────────────────────
export function subscribeOpenReports(onUpdate: (r: ContentReport[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    // Sorted here rather than with orderBy, so no composite index is needed.
    query(collection(db, 'reports'), where('status', '==', 'open')),
    (snap) => {
      const ms = (v: unknown) => (v as { toMillis?: () => number })?.toMillis?.() ?? Date.now();
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContentReport).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)));
    },
    (err) => onError?.(err),
  );
}
export function setReportStatus(id: string, status: 'resolved' | 'dismissed') {
  return updateDoc(doc(db, 'reports', id), { status, reviewedAt: serverTimestamp() });
}
/** Removes the reported content itself (admin only, per the rules). */
export function deleteReportedContent(t: ReportTarget) {
  switch (t.kind) {
    case 'channelPost': return deleteDoc(doc(db, 'channels', t.channelId, 'posts', t.postId));
    case 'channelReply': return deleteDoc(doc(db, 'channels', t.channelId, 'posts', t.postId, 'replies', t.replyId));
    case 'challengePost': return deleteDoc(doc(db, 'challenges', t.challengeId, 'posts', t.postId));
    case 'prPost': return deleteDoc(doc(db, 'prPosts', t.postId));
  }
}
export function reportLink(t: ReportTarget): string {
  switch (t.kind) {
    case 'channelPost': case 'channelReply': return `/community/${t.channelId}#post-${t.postId}`;
    case 'challengePost': return `/community/challenges/${t.challengeId}`;
    case 'prPost': return '/community/prs';
  }
}
