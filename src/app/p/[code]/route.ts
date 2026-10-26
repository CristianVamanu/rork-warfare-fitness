export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /p/CODE — a partner's share link.
 *
 * Counts the click (once per visitor per day), drops the attribution cookie
 * and sends the visitor to the front door. The cookie is httpOnly: nothing in
 * the browser can read or forge it, and /api/partner/attach reads it
 * server-side once the visitor has an account. An unknown code still lands on
 * the site — a dead link would cost the sale, not just the attribution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { recordPartnerClick, getPartnerByCode, getPartnerConfig } from '@/lib/partnersServer';
import { normalizePartnerCode, partnerCanEarn, PARTNER_COOKIE } from '@/lib/partners';

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = normalizePartnerCode(raw);
  const url = new URL(req.url);
  // Partners can deep-link: /p/CODE?to=/programs sends the visitor there.
  const to = url.searchParams.get('to');
  const dest = to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/p/') ? to : '/onboarding';
  const res = NextResponse.redirect(new URL(dest, url.origin), 302);

  const app = getAdminApp();
  if (!code || !app) return res;
  const db = getAdminDb(app);
  try {
    const [partner, cfg] = await Promise.all([getPartnerByCode(db, code), getPartnerConfig(db)]);
    if (partner && partnerCanEarn(partner) && cfg.enabled) {
      res.cookies.set(PARTNER_COOKIE, partner.code, {
        httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', path: '/',
        maxAge: cfg.cookieDays * 24 * 3600,
      });
      await recordPartnerClick(db, { code: partner.code, ip: clientIp(req), ua: req.headers.get('user-agent'), landing: dest });
    }
  } catch (err) {
    console.error('[partner link] failed to record click:', err instanceof Error ? err.message : err);
  }
  return res;
}
