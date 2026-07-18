import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { refreshTokens, fetchLatestSummary } from '@/lib/whoop';
import { encryptSecret, decryptSecret, type EncryptedPayload } from '@/lib/crypto';

interface StoredWhoop {
  accessToken: EncryptedPayload;
  refreshToken: EncryptedPayload;
  expiresAt: number;
  connectedAt: number;
}

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const ref = db.collection('integrations').doc(check.uid);

  try {
    const doc = await ref.get();
    const whoop = doc.data()?.whoop as StoredWhoop | undefined;
    if (!whoop) return NextResponse.json({ error: 'WHOOP not connected' }, { status: 400 });

    let accessToken = decryptSecret(whoop.accessToken);
    let refreshToken = whoop.refreshToken;
    let expiresAt = whoop.expiresAt;

    // Refresh a few minutes early rather than waiting for a 401
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const fresh = await refreshTokens(decryptSecret(whoop.refreshToken));
      accessToken = fresh.accessToken;
      refreshToken = encryptSecret(fresh.refreshToken);
      expiresAt = fresh.expiresAt;
    }

    const summary = await fetchLatestSummary(accessToken);

    await ref.set({
      whoop: {
        accessToken: encryptSecret(accessToken),
        refreshToken,
        expiresAt,
        connectedAt: whoop.connectedAt,
        summary,
      },
    }, { merge: true });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error('[whoop/sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
