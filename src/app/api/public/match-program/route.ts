export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { matchProgram, type MatchAnswers } from '@/lib/programMatch';
import { rateLimit, clientIp } from '@/lib/rateLimit';

/**
 * The match, shown BEFORE the visitor has an account.
 *
 * Onboarding used to ask for a name, an email and a password and only then
 * reveal which program the answers had earned — so the hardest ask in the
 * funnel came before anything had been given back. This route lets that
 * screen lead with the actual program instead: here is what you matched,
 * now save it.
 *
 * Unauthenticated because that is the entire point — there is no account
 * yet. Safe to be: it reads nothing about anybody, writes nothing, and
 * returns only the same public program copy already on /programs. Rate
 * limited per IP anyway, because it does hit Firestore.
 *
 * Shares lib/programMatch with the authenticated assignment route, so the
 * program named here is the program actually enrolled a moment later.
 */
export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit({ scope: 'public-match-program', key: clientIp(req), windowMs: 60_000, max: 20 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const { goal, experience, trainingDays, sex, hasLimitations, equipment, estimatedWeeksToGoal } =
      (await req.json()) as MatchAnswers;

    if (!goal || !experience || !trainingDays) {
      return NextResponse.json({ error: 'Missing required fields: goal, experience, trainingDays' }, { status: 400 });
    }

    const program = await matchProgram({ goal, experience, trainingDays, sex, hasLimitations, equipment, estimatedWeeksToGoal });
    if (!program) return NextResponse.json({ error: 'No programs available' }, { status: 404 });

    return NextResponse.json({ program });
  } catch (err: unknown) {
    console.error('[public/match-program] Error:', err);
    return NextResponse.json({ error: 'Program match failed' }, { status: 500 });
  }
}
