export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { code? } — attaches partner attribution to the signed-in member.
 *
 * Two sources, in order of trust:
 *   1. `code` in the body: typed by the member at checkout ("Partner code").
 *   2. The httpOnly wf_ref cookie dropped by /p/CODE or the middleware.
 *
 * Called after signup (onboarding), on every app launch (cheap no-op when
 * there is nothing to attach) and from the checkout page. The member's uid
 * comes from their own token; who gets credited is resolved from the code
 * server-side. Never fails the caller: a problem here must not touch signup
 * or checkout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { attachPendingCode, getPartnerConfig } from '@/lib/partnersServer';
import { normalizePartnerCode, PARTNER_COOKIE } from '@/lib/partners';

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ ok: true, attached: false });
  const db = getAdminDb(app);

  const body = await req.json().catch(() => ({})) as { code?: unknown };
  const typed = normalizePartnerCode(body.code);
  const cookie = normalizePartnerCode(req.cookies.get(PARTNER_COOKIE)?.value);
  if (!typed && !cookie) return NextResponse.json({ ok: true, attached: false, reason: 'no_code' });

  try {
    const cfg = await getPartnerConfig(db);
    if (!cfg.enabled) return NextResponse.json({ ok: true, attached: false, reason: 'disabled' });
    const result = typed
      ? await attachPendingCode(db, { uid: check.uid, code: typed, source: 'typed' })
      : await attachPendingCode(db, { uid: check.uid, code: cookie!, source: 'link' });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[partner attach]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: true, attached: false, reason: 'error' });
  }
}

/** GET — what the member currently has attached, for the checkout field. */
export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ code: null });
  const snap = await getAdminDb(app).collection('users').doc(check.uid).get();
  const a = (snap.data()?.attribution ?? {}) as { pendingCode?: string; partnerCode?: string; partnerId?: string; source?: string };
  return NextResponse.json({ code: a.partnerCode ?? a.pendingCode ?? null, locked: !!a.partnerId, source: a.source ?? null });
}
