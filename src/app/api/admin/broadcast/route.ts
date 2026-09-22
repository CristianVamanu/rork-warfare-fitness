export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Queue a broadcast. The admin never sends 5,000 emails from a browser
 * request that Cloudflare cuts off at 100 seconds: this writes one
 * document, and the hourly cron (which already pages every user) does the
 * sending, resumably, a page at a time, with a cursor so a crash mid-way
 * picks up where it stopped rather than re-sending the first half.
 *
 * Audiences:
 *   members — active membership
 *   free    — accounts without one
 *   users   — every account
 *   leads   — standards-test and free-plan leads who ticked the box
 *
 * Every broadcast is marketing: it carries the one-click unsubscribe and
 * skips anyone who has used one. That is not configurable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { isBroadcastAudience } from '@/lib/broadcast';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const { audience, subject, body, ctaLabel, ctaPath } = await req.json().catch(() => ({})) as {
    audience?: string; subject?: string; body?: string; ctaLabel?: string; ctaPath?: string;
  };
  const s = (subject ?? '').trim();
  const b = (body ?? '').trim();
  if (!isBroadcastAudience(audience)) return NextResponse.json({ error: 'Unknown audience' }, { status: 400 });
  if (!s || !b) return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  if (s.length > 200 || b.length > 5000) return NextResponse.json({ error: 'Subject max 200 characters, body max 5000' }, { status: 400 });
  const path = typeof ctaPath === 'string' && ctaPath.startsWith('/') ? ctaPath : '/dashboard';
  const label = typeof ctaLabel === 'string' && ctaLabel.trim() ? ctaLabel.trim().slice(0, 60) : 'Open the app';

  try {
    const ref = await getAdminDb(app).collection('broadcasts').add({
      audience, subject: s, body: b, ctaLabel: label, ctaPath: path,
      status: 'queued', sentCount: 0, skippedCount: 0, cursor: null,
      createdBy: check.uid, createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error('[admin/broadcast]', err);
    return NextResponse.json({ error: 'Failed to queue' }, { status: 500 });
  }
}
