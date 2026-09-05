export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads (and resolves) the client error groups written by /api/client-error.
 *
 * GET  — the most recently seen groups, newest first. `?includeResolved=1`
 *        to see ones already dealt with.
 * POST — { fingerprint, resolved } to mark a group handled, or reopen it.
 *
 * The collection has no firestore.rules match, so it is server-only: no client
 * can read other people's stack traces or clear the list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const includeResolved = new URL(req.url).searchParams.get('includeResolved') === '1';
    let q = db.collection('errorReports').orderBy('lastSeenAt', 'desc').limit(100);
    if (!includeResolved) q = db.collection('errorReports').where('resolved', '==', false).orderBy('lastSeenAt', 'desc').limit(100);

    const snap = await q.get();
    const toIso = (v: { toDate?: () => Date } | undefined) => v?.toDate?.().toISOString() ?? null;
    return NextResponse.json({
      errors: snap.docs.map((d) => {
        const x = d.data();
        return {
          fingerprint: d.id,
          message: x.message ?? '',
          stack: x.stack ?? null,
          kind: x.kind ?? 'error',
          count: x.count ?? 0,
          lastUrl: x.lastUrl ?? null,
          lastUserAgent: x.lastUserAgent ?? null,
          firstSeenAt: toIso(x.firstSeenAt),
          lastSeenAt: toIso(x.lastSeenAt),
          resolved: !!x.resolved,
        };
      }),
    });
  } catch (err) {
    // The composite index (resolved, lastSeenAt) may not be published yet —
    // say which, rather than returning an empty list that reads as "no errors".
    console.error('[admin/errors] Query failed:', err);
    return NextResponse.json({ error: 'Could not read error reports. If this persists, deploy Firestore indexes.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const { fingerprint, resolved } = await req.json().catch(() => ({})) as { fingerprint?: string; resolved?: boolean };
  if (!fingerprint) return NextResponse.json({ error: 'fingerprint required' }, { status: 400 });

  await db.collection('errorReports').doc(fingerprint).set({
    resolved: resolved !== false,
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy: check.uid,
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
