import { NextResponse } from 'next/server';

/**
 * warfarefitness.com/ig — the link for the Instagram bio.
 *
 * Sends the visitor to the home page tagged utm_campaign=instagram, so the
 * funnel counts Instagram traffic by itself (it all showed as "direct"
 * before). A short path because it is typed into a bio and read by people.
 */
export const dynamic = 'force-dynamic';

// A relative Location, on purpose: behind the reverse proxy the request's own
// origin is the internal address (localhost:3000), and an absolute redirect
// built from it sent visitors there.
export function GET() {
  return new NextResponse(null, { status: 302, headers: { Location: '/?utm_campaign=instagram&utm_source=instagram', 'Cache-Control': 'no-store' } });
}
