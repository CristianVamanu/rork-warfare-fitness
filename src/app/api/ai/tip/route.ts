export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The dashboard's daily brief, for members.
 *
 * Generation is automatic and happens here: whoever opens the dashboard first
 * on a new day finds no stored tip and creates the one everybody sees. The
 * admin panel's regenerate button runs the same code from src/lib/dailyTip.ts,
 * so the two cannot drift apart.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';
import { resolveDateKey, readStoredTip, generateAndStoreTip } from '@/lib/dailyTip';

// Was fully unauthenticated with no rate limiting — anyone could hit it
// directly to burn OpenAI spend once the daily cache missed. The result is
// shared across all users (one document per calendar day), so this only needs
// to gate who can trigger generation, not per-user usage.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const limited = await rateLimit({ scope: 'ai-tip', key: check.uid, windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
  if (!limited.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
  }

  // This route calls OpenAI, so every authenticated account was a metered
  // spend endpoint regardless of whether they pay for anything — the only AI
  // route with no membership check.
  const app = getAdminApp();
  if (app) {
    const access = await verifyFeatureAccess(app, check.uid, 'ai-tip');
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const dateKey = resolveDateKey(req.nextUrl.searchParams.get('date'));
  const db = app ? getAdminDb(app) : null;

  if (db) {
    const stored = await readStoredTip(db, dateKey);
    if (stored) return NextResponse.json({ tip: stored, date: dateKey, cached: true });
  }

  const { tip } = await generateAndStoreTip(db, dateKey);
  return NextResponse.json({ tip, date: dateKey });
}
