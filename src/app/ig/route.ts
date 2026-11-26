import { NextRequest, NextResponse } from 'next/server';

/**
 * warfarefitness.com/ig — the link for the Instagram bio.
 *
 * Sends the visitor to the home page tagged utm_campaign=instagram, so the
 * funnel counts Instagram traffic by itself (it all showed as "direct"
 * before). A short path because it is typed into a bio and read by people.
 */
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const to = new URL('/', req.nextUrl.origin);
  to.searchParams.set('utm_campaign', 'instagram');
  to.searchParams.set('utm_source', 'instagram');
  return NextResponse.redirect(to, 302);
}
