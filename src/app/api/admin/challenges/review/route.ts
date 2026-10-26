export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { initWebPush, sendPushToUsers } from '@/lib/pushSend';
import { xpToPowerLevel } from '@/lib/xp';
import { DEFAULT_CHALLENGE_XP } from '@/types';

/**
 * Verify or reject a challenge submission.
 *
 * Server-side because verifying is what pays out: XP on the member's user
 * document, the challenge badge, the tiered achievement, the notification
 * and the push. The client cannot write another member's XP (nor should
 * it), and a verification that paid half of that out and then lost the
 * network would leave a finisher with a badge and no XP. One transaction
 * here, or nothing.
 *
 * Re-reviews are honest: rejecting a previously verified entry takes the
 * XP and the badge back, so an admin who verifies the wrong person by
 * mistake can undo it.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json().catch(() => null) as { challengeId?: string; userId?: string; status?: string; note?: string } | null;
  const challengeId = body?.challengeId, userId = body?.userId, status = body?.status;
  if (!challengeId || !userId || (status !== 'verified' && status !== 'rejected')) {
    return NextResponse.json({ error: 'challengeId, userId and status (verified|rejected) are required' }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const chRef = db.collection('challenges').doc(challengeId);
  const entryRef = chRef.collection('entries').doc(userId);
  const userRef = db.collection('users').doc(userId);

  let title = '';
  let xpDelta = 0;
  let newAchievements: string[] = [];
  try {
    await db.runTransaction(async (tx) => {
      const [ch, entry, user] = await Promise.all([tx.get(chRef), tx.get(entryRef), tx.get(userRef)]);
      if (!ch.exists) throw new Error('Challenge not found');
      if (!entry.exists) throw new Error('Entry not found');
      const c = ch.data()!;
      const e = entry.data()!;
      const u = user.data() ?? {};
      title = String(c.title ?? 'Challenge');
      const wasVerified = e.status === 'verified';
      const xp = typeof c.xpReward === 'number' && c.xpReward >= 0 ? Math.min(c.xpReward, 5000) : DEFAULT_CHALLENGE_XP;

      tx.update(entryRef, {
        status,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: check.uid,
        ...(note ? { reviewNote: note } : { reviewNote: FieldValue.delete() }),
      });

      const badges: { challengeId: string }[] = Array.isArray(u.challengeBadges) ? u.challengeBadges : [];
      const others = badges.filter((b) => b.challengeId !== challengeId);
      const achievements: string[] = Array.isArray(u.achievements) ? u.achievements : [];

      if (status === 'verified' && !wasVerified) {
        xpDelta = xp;
        const nextBadges = [...others, { challengeId, title, result: e.result ?? null, earnedAt: new Date() }];
        const n = nextBadges.length;
        newAchievements = [[1, 'challenge_1'], [5, 'challenge_5'], [10, 'challenge_10'], [25, 'challenge_25']]
          .filter(([at, id]) => n >= (at as number) && !achievements.includes(id as string))
          .map(([, id]) => id as string);
        const totalXP = (Number(u.xp) || 0) + xp;
        tx.set(userRef, {
          xp: totalXP,
          powerLevel: xpToPowerLevel(totalXP),
          challengeBadges: nextBadges,
          ...(newAchievements.length ? { achievements: FieldValue.arrayUnion(...newAchievements) } : {}),
        }, { merge: true });
        tx.update(chRef, { verifiedCount: FieldValue.increment(1) });
      } else if (status === 'rejected' && wasVerified) {
        xpDelta = -xp;
        const totalXP = Math.max(0, (Number(u.xp) || 0) - xp);
        tx.set(userRef, { xp: totalXP, powerLevel: xpToPowerLevel(totalXP), challengeBadges: others }, { merge: true });
        tx.update(chRef, { verifiedCount: FieldValue.increment(-1) });
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[challenges/review] failed:', msg);
    return NextResponse.json({ error: msg }, { status: msg.includes('not found') ? 404 : 500 });
  }

  // Notification + push, after the money is in the bank. Neither may fail
  // the review: the decision stands even if the phone is off.
  const verified = status === 'verified';
  const text = verified
    ? `Your result is confirmed${xpDelta > 0 ? ` — +${xpDelta} XP` : ''}. It counts, and it is on the board.`
    : (note || 'Your proof did not show the full challenge. Have another go and submit again.');
  const url = `/community/challenges/${challengeId}`;
  await db.collection('notifications').add({
    userId,
    type: verified ? 'challenge_verified' : 'challenge_rejected',
    title: verified ? `${title}: verified` : `${title}: not verified`,
    body: text,
    actionLabel: 'Open challenge',
    actionUrl: url,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }).catch((e) => console.error('[challenges/review] notification failed:', e));
  if (await initWebPush().catch(() => false)) {
    await sendPushToUsers(db, [userId], { title: verified ? `${title}: verified ✓` : `${title}: not verified`, body: text, url }).catch(() => {});
  }

  return NextResponse.json({ ok: true, xpDelta, newAchievements });
}
