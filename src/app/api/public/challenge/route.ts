export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?id=X — the teaser of one challenge: title, brief, cover, counts.
 * Unauthenticated because a shared link lands on people with no account.
 * The share page itself reads through lib/challengesPublic directly; this
 * route serves anything outside the app that wants the same teaser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { loadPublicChallenge } from '@/lib/challengesPublic';

export type { PublicChallenge } from '@/lib/challengesPublic';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

export async function GET(req: NextRequest) {
  const limit = await rateLimit({ scope: 'public-challenge', key: clientIp(req), windowMs: 60_000, max: 120 });
  if (!limit.allowed) return NextResponse.json({ challenge: null }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  const challenge = await loadPublicChallenge(req.nextUrl.searchParams.get('id') ?? '');
  return NextResponse.json({ challenge }, { status: challenge ? 200 : 404, headers: { 'Cache-Control': CACHE } });
}
