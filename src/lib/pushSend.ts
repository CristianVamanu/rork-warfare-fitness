import webpush from 'web-push';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';

/**
 * The one place a web push is actually sent.
 *
 * Used by /api/push/send (the hourly cron, secret-authenticated) and by
 * /api/admin/push (an admin's own actions, ID-token-authenticated). Before
 * this the sending logic lived inside the cron route, so nothing an admin did
 * from the browser could reach a phone: assign a goal or a nutrition plan and
 * the member found out when they next opened the app, if they opened it.
 */
export async function initWebPush(): Promise<boolean> {
  const [secretPub, priv] = await Promise.all([
    getSecret('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    getSecret('VAPID_PRIVATE_KEY'),
  ]);
  let pub = secretPub;
  if (!pub) {
    const app = getAdminApp();
    if (app) {
      const cfg = await getAdminDb(app).collection('system').doc('config').get().catch(() => null);
      pub = (cfg?.data()?.vapidPublicKey as string) || '';
    }
  }
  if (!pub || !priv) {
    console.error('[push] VAPID not configured — public key:', pub ? 'set' : 'MISSING', 'private key:', priv ? 'set' : 'MISSING');
    return false;
  }
  webpush.setVapidDetails('mailto:' + (process.env.ADMIN_EMAIL || 'admin@warfarefitness.com'), pub, priv);
  return true;
}

export interface PushPayload { title: string; body: string; url?: string }

/**
 * Sends to every registered device of the given users, or to everyone when
 * `userIds` is null. Dead subscriptions (404/410) are deleted as they are
 * found — nothing else in the app prunes them.
 */
export async function sendPushToUsers(db: Firestore, userIds: string[] | null, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (userIds === null) {
    const snap = await db.collectionGroup('devices').get();
    docs = snap.docs.filter((d) => d.ref.parent.parent?.parent.id === 'pushSubscriptions');
  } else {
    const snaps = await Promise.all(userIds.map((uid) => db.collection('pushSubscriptions').doc(uid).collection('devices').get()));
    docs = snaps.flatMap((s) => s.docs);
  }
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(docs.map(async (d) => {
    const sub = d.data()?.subscription;
    if (!sub) return;
    try {
      await webpush.sendNotification(sub, body);
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      const statusCode = e?.statusCode;
      // 404/410: the browser dropped the subscription; it is removed.
      // 401/403: the push service rejects our VAPID signature. That is
      // either this one subscription, created under an older public key,
      // or our own keys being wrong for every subscription at once. The two
      // cannot be told apart here, and deleting on the second would wipe
      // every device in one cron run, so the document is kept and the
      // failure recorded on it; the Settings toggle re-subscribes a device
      // whose key no longer matches.
      const dead = statusCode === 404 || statusCode === 410;
      if (dead) await d.ref.delete().catch(() => {});
      else if (statusCode === 401 || statusCode === 403) await d.ref.set({ lastError: statusCode, lastErrorAt: new Date() }, { merge: true }).catch(() => {});
      let host = '?';
      try { host = new URL(sub.endpoint).host; } catch { /* leave '?' */ }
      throw new Error(`${statusCode ?? 'no status'} from ${host}${dead ? ' (subscription removed)' : ''}: ${(e?.body || e?.message || '').toString().slice(0, 160)}`);
    }
  }));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.error(`[push] ${failed} of ${docs.length} sends failed:`,
      results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message ?? r));
  }
  return { sent, failed };
}
