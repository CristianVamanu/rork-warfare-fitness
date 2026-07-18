import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { refreshTokens, fetchLatestSummary } from '@/lib/whoop';
import { encryptSecret, decryptSecret, type EncryptedPayload } from '@/lib/crypto';

interface StoredWhoop {
  accessToken: EncryptedPayload;
  refreshToken: EncryptedPayload;
  expiresAt: number;
  connectedAt: number;
}

/**
 * Syncs WHOOP data for every connected user in one pass — meant to be hit
 * by a scheduled job (VPS crontab) rather than a person, e.g.:
 *   0 * * * * curl -s -X POST https://yourdomain.com/api/whoop/sync-all \
 *     -H "Authorization: Bearer $CRON_SECRET"
 * One user's failure (expired/revoked token, WHOOP API hiccup) doesn't stop
 * the rest — each is synced independently and errors are just counted.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const snap = await db.collection('integrations').where('whoop', '!=', null).get();

  let synced = 0;
  let failed = 0;

  await Promise.all(snap.docs.map(async (doc) => {
    const whoop = doc.data().whoop as StoredWhoop | undefined;
    if (!whoop) return;
    try {
      let accessToken = decryptSecret(whoop.accessToken);
      let refreshToken = whoop.refreshToken;
      let expiresAt = whoop.expiresAt;

      if (Date.now() > expiresAt - 5 * 60 * 1000) {
        const fresh = await refreshTokens(decryptSecret(whoop.refreshToken));
        accessToken = fresh.accessToken;
        refreshToken = encryptSecret(fresh.refreshToken);
        expiresAt = fresh.expiresAt;
      }

      const summary = await fetchLatestSummary(accessToken);

      await doc.ref.set({
        whoop: {
          accessToken: encryptSecret(accessToken),
          refreshToken,
          expiresAt,
          connectedAt: whoop.connectedAt,
          summary,
        },
      }, { merge: true });
      synced++;
    } catch (err) {
      console.warn(`[whoop/sync-all] Failed for ${doc.id}:`, err);
      failed++;
    }
  }));

  return NextResponse.json({ ok: true, synced, failed, total: snap.docs.length });
}
