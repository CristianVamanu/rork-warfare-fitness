export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?id=X — the teaser of one challenge for the public share page:
 * title, brief, cover, counts. Unauthenticated because a shared link lands
 * on people with no account, which is the point of sharing it.
 *
 * Only live and closed challenges answer; a draft is 404 here exactly as
 * it is invisible to members. Rules, loadouts and the feed stay behind
 * login — the page is a hook, not the challenge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

export interface PublicChallenge {
  id: string;
  title: string;
  brief: string;
  category: string | null;
  difficulty: string;
  status: 'live' | 'closed';
  cover: { url: string; type: 'image' | 'video'; posterURL: string | null } | null;
  entryCount: number;
  verifiedCount: number;
  endsAt: string | null;
}

export async function GET(req: NextRequest) {
  const limit = await rateLimit({ scope: 'public-challenge', key: clientIp(req), windowMs: 60_000, max: 120 });
  if (!limit.allowed) return NextResponse.json({ challenge: null }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });

  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ challenge: null }, { status: 404 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ challenge: null }, { status: 500 });

  try {
    const snap = await getAdminDb(app).collection('challenges').doc(id).get();
    const c = snap.data();
    if (!snap.exists || !c || (c.status !== 'live' && c.status !== 'closed')) {
      return NextResponse.json({ challenge: null }, { status: 404, headers: { 'Cache-Control': CACHE } });
    }
    const first = Array.isArray(c.media) && c.media[0] ? c.media[0] : null;
    const out: PublicChallenge = {
      id: snap.id,
      title: String(c.title ?? '').slice(0, 120),
      brief: String(c.brief ?? '').slice(0, 300),
      category: c.category ? String(c.category).slice(0, 40) : null,
      difficulty: String(c.difficulty ?? 'standard'),
      status: c.status,
      cover: first ? { url: String(first.url), type: first.type === 'video' ? 'video' : 'image', posterURL: first.posterURL ? String(first.posterURL) : null } : null,
      entryCount: Number(c.entryCount) || 0,
      verifiedCount: Number(c.verifiedCount) || 0,
      endsAt: c.endsAt?.toDate?.()?.toISOString?.() ?? null,
    };
    return NextResponse.json({ challenge: out }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/challenge] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ challenge: null }, { status: 500 });
  }
}
