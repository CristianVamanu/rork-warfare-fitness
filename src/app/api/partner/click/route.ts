export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { code, landing } — counts a click that arrived as `?pref=CODE` on any
 * page (the middleware sets the cookie at the edge; it cannot write to
 * Firestore, so the page itself reports the click here, once per load).
 *
 * Unauthenticated by design: visitors have no account yet. Abuse is bounded
 * by recordPartnerClick's per-visitor-per-day document id, so hammering this
 * endpoint cannot inflate a partner's numbers past one per visitor per day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { recordPartnerClick } from '@/lib/partnersServer';
import { normalizePartnerCode } from '@/lib/partners';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { code?: unknown; landing?: unknown };
  const code = normalizePartnerCode(body.code);
  if (!code) return NextResponse.json({ ok: true, counted: false });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ ok: true, counted: false });
  const fwd = req.headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || null;
  try {
    const counted = await recordPartnerClick(getAdminDb(app), {
      code, ip, ua: req.headers.get('user-agent'),
      landing: typeof body.landing === 'string' ? body.landing : '/',
    });
    return NextResponse.json({ ok: true, counted });
  } catch (err) {
    console.error('[partner click]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: true, counted: false });
  }
}
