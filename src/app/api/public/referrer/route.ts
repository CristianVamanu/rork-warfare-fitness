export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?code=X — resolves a referral code to the sharer's first name, for
 * the "Cristian is training on this" line on a shared program page.
 *
 * Unauthenticated by necessity (a stranger clicking a shared link has no
 * account) and deliberately returns almost nothing: only a first name,
 * never the full profile, email, stats or uid. `users/{uid}` holds
 * membership status, purchase history and more — reading the whole
 * document server-side and handing back one field is what keeps all of
 * that off a page search engines will index.
 *
 * Cached hard: a referral code never changes who it belongs to once
 * issued, so there is nothing here that needs to be fresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { isValidReferralCode } from '@/lib/referral';

const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

export async function GET(req: NextRequest) {
  const limit = await rateLimit({ scope: 'public-referrer', key: clientIp(req), windowMs: 60_000, max: 60 });
  if (!limit.allowed) {
    return NextResponse.json({ referrerName: null }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!isValidReferralCode(code)) return NextResponse.json({ referrerName: null }, { headers: { 'Cache-Control': CACHE } });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ referrerName: null });

  try {
    const db = getAdminDb(app);
    const codeSnap = await db.collection('referralCodes').doc(code).get();
    const uid = codeSnap.data()?.uid as string | undefined;
    if (!uid) return NextResponse.json({ referrerName: null }, { headers: { 'Cache-Control': CACHE } });

    const userSnap = await db.collection('users').doc(uid).get();
    const displayName = userSnap.data()?.displayName as string | undefined;
    // First name only, and capped — a display name is free text a user
    // chose, not vetted for length or content, and this is going straight
    // onto a public page.
    const firstName = displayName?.trim().split(/\s+/)[0]?.slice(0, 30) || null;

    return NextResponse.json({ referrerName: firstName }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/referrer] Error:', err);
    return NextResponse.json({ referrerName: null });
  }
}
