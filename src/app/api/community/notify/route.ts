export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST — the social side of the community: tells a member when someone
 * likes or replies to their post, and credits posting activity toward the
 * community badges.
 *
 * Why a route and not a client write: firestore.rules only lets a member
 * create a notification whose recipient is staff, so a member cannot
 * notify another member from the browser, and letting them would open a
 * way to write arbitrary text into anyone's feed. Here the caller's token
 * is verified, the like or reply is checked to actually exist and belong
 * to the caller, and only then is the recipient written to with the
 * admin SDK. Deterministic document ids make every call idempotent: a
 * like un-liked and re-liked notifies once, a replayed request credits a
 * post once.
 *
 * Body: { kind: 'like' | 'reply' | 'post', channelId, postId, replyId? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { sendPushToUsers } from '@/lib/pushSend';
import { communityBadgesEarned, ACHIEVEMENT_DEFS } from '@/lib/achievements';

type Kind = 'like' | 'reply' | 'post';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const snippet = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 80) : '');

export async function POST(req: NextRequest) {
  const auth = await verifyAuthedNotTfaPending(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const limited = await rateLimit({ scope: 'community-notify', key: auth.uid, windowMs: 60_000, max: 60 });
  if (!limited.allowed) return NextResponse.json({ error: 'Slow down' }, { status: 429 });

  let body: { kind?: Kind; channelId?: string; postId?: string; replyId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { kind, channelId, postId, replyId } = body;
  if (!kind || !['like', 'reply', 'post'].includes(kind) || !ID.test(channelId ?? '') || !ID.test(postId ?? '') || (replyId !== undefined && !ID.test(replyId))) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const db = getAdminDb(app);
  const uid = auth.uid;
  const postRef = db.collection('channels').doc(channelId!).collection('posts').doc(postId!);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const post = postSnap.data() as { userId?: string; content?: string; likes?: string[] };
  const postUrl = `/community/${channelId}#post-${postId}`;

  const actorSnap = await db.collection('users').doc(uid).get();
  const actorName = ((actorSnap.data()?.displayName as string) || 'Someone').trim().slice(0, 40);

  /** Create-once notification. Returns false when it already existed. */
  async function notifyOnce(id: string, to: string, data: { type: string; title: string; body: string }) {
    if (to === uid) return false;
    const ref = db.collection('notifications').doc(id);
    try {
      await ref.create({ userId: to, ...data, actionLabel: 'Open post', actionUrl: postUrl, read: false, createdAt: FieldValue.serverTimestamp() });
    } catch { return false; } // already exists
    sendPushToUsers(db, [to], { title: data.title, body: data.body, url: postUrl }).catch(() => {});
    return true;
  }

  /** Credit an activity once (marker doc), bump the stat, award badges. */
  async function credit(markerId: string, who: string, field: 'posts' | 'likesReceived'): Promise<string[]> {
    try { await db.collection('communityCredits').doc(markerId).create({ uid: who, at: FieldValue.serverTimestamp() }); }
    catch { return []; }
    const userRef = db.collection('users').doc(who);
    await userRef.set({ communityStats: { [field]: FieldValue.increment(1) } }, { merge: true });
    const fresh = (await userRef.get()).data() ?? {};
    const stats = (fresh.communityStats ?? {}) as { posts?: number; likesReceived?: number };
    const existing = (fresh.achievements as string[]) ?? [];
    const earned = communityBadgesEarned(existing, { communityPosts: stats.posts ?? 0, likesReceived: stats.likesReceived ?? 0 });
    if (earned.length === 0) return [];
    await userRef.set({ achievements: FieldValue.arrayUnion(...earned) }, { merge: true });
    for (const id of earned) {
      const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
      if (!def) continue;
      const title = `${def.icon} Badge unlocked: ${def.title}`;
      await db.collection('notifications').doc(`badge_${who}_${id}`).create({
        userId: who, type: 'auto_milestone', title, body: def.desc, actionLabel: 'See your badges', actionUrl: '/achievements', read: false, createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      sendPushToUsers(db, [who], { title, body: def.desc, url: '/achievements' }).catch(() => {});
    }
    return earned;
  }

  if (kind === 'like') {
    if (!Array.isArray(post.likes) || !post.likes.includes(uid)) return NextResponse.json({ ok: false, reason: 'Not liked' }, { status: 400 });
    const author = post.userId ?? '';
    const sent = author && author !== uid
      ? await notifyOnce(`cl_${postId}_${uid}`, author, { type: 'community_like', title: `${actorName} liked your post`, body: snippet(post.content) || 'Open it to see.' })
      : false;
    if (sent) await credit(`cl_${postId}_${uid}`, author, 'likesReceived');
    return NextResponse.json({ ok: true, newAchievements: [] });
  }

  if (kind === 'reply') {
    if (!replyId) return NextResponse.json({ error: 'replyId required' }, { status: 400 });
    const replySnap = await postRef.collection('replies').doc(replyId).get();
    const reply = replySnap.data() as { userId?: string; content?: string; parentReplyId?: string } | undefined;
    if (!replySnap.exists || reply?.userId !== uid) return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    const text = snippet(reply.content) || 'Open it to read.';
    const author = post.userId ?? '';
    if (author) await notifyOnce(`cr_${replyId}`, author, { type: 'community_reply', title: `${actorName} replied to your post`, body: text });
    if (reply.parentReplyId && ID.test(reply.parentReplyId)) {
      const parent = (await postRef.collection('replies').doc(reply.parentReplyId).get()).data() as { userId?: string } | undefined;
      if (parent?.userId && parent.userId !== author) {
        await notifyOnce(`cr_${replyId}_p`, parent.userId, { type: 'community_reply', title: `${actorName} replied to you`, body: text });
      }
    }
    const newAchievements = await credit(`cc_${replyId}`, uid, 'posts');
    return NextResponse.json({ ok: true, newAchievements });
  }

  // kind === 'post'
  if (post.userId !== uid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });
  const newAchievements = await credit(`cc_${postId}`, uid, 'posts');
  return NextResponse.json({ ok: true, newAchievements });
}
