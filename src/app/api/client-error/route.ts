export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Minimal first-party error reporting.
 *
 * Sentry was removed (see next.config.js), which left the app with no way to
 * learn that anything had broken except a member emailing in. That is fine at
 * three users and untenable at a few thousand. This is the smallest thing that
 * closes the gap: the browser posts an error here, and it is stored — grouped,
 * counted, and capped — in a server-only collection the admin panel reads.
 *
 * Deliberately NOT a Sentry replacement. No breadcrumbs, no source maps, no
 * release tracking. What it answers is "is something broken right now, for how
 * many people, and where", which is the question that actually matters.
 *
 * Unauthenticated: errors thrown before or during sign-in are exactly the ones
 * worth seeing. Rate limited per IP, and identical errors are grouped into one
 * document with a counter, so a browser stuck in a loop cannot write unbounded
 * documents or run up a Firestore bill.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const MAX_FIELD = 2_000;
const clip = (v: unknown, max = MAX_FIELD) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export async function POST(req: NextRequest) {
  const app = getAdminApp();
  if (!app) return NextResponse.json({ ok: true }); // never fail the client over telemetry
  const db = getAdminDb(app);

  try {
    const ip = clientIp(req);
    const limit = await rateLimit({ scope: 'client-error', key: ip, windowMs: 60_000, max: 20 });
    if (!limit.allowed) return NextResponse.json({ ok: true, throttled: true });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const message = clip(body.message, 500);
    if (!message) return NextResponse.json({ ok: true });

    const stack = clip(body.stack);
    const url = clip(body.url, 500);
    const kind = body.kind === 'unhandledrejection' ? 'unhandledrejection' : 'error';

    // Group by message + the first stack frame. Anything more specific (full
    // stack, line numbers) splits one bug across a document per browser build.
    const firstFrame = stack?.split('\n').slice(1, 2).join('') ?? '';
    const fingerprint = crypto.createHash('sha256').update(`${message}|${firstFrame}`).digest('hex').slice(0, 32);

    const ref = db.collection('errorReports').doc(fingerprint);
    const existing = await ref.get();

    await ref.set({
      message,
      stack,
      kind,
      lastUrl: url ?? null,
      lastUserAgent: clip(req.headers.get('user-agent'), 300) ?? null,
      lastSeenAt: FieldValue.serverTimestamp(),
      // Only on the first occurrence — a merge would otherwise stamp this on
      // every report, and "when did this start" is the field that tells you
      // whether a bug arrived with today's deploy.
      ...(existing.exists ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
      count: FieldValue.increment(1),
      // A group that was marked resolved and then happens again is not
      // resolved. Reopen it rather than letting it hide.
      ...(existing.data()?.resolved ? { resolved: false, reopenedAt: FieldValue.serverTimestamp() } : { resolved: false }),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[client-error] Could not record report:', err);
    return NextResponse.json({ ok: true });
  }
}
