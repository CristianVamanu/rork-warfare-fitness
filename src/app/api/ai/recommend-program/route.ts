import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp } from '@/lib/firebase-admin';
import { matchProgram, type MatchAnswers } from '@/lib/programMatch';

/**
 * Assigns a user into the best-fit existing program rather than generating
 * one from scratch with AI. Deterministic and instant — no OpenAI call, no
 * per-user program-quality variance, and every plan a real human designed.
 *
 * The matching itself lives in lib/programMatch so this route and the public
 * preview one (api/public/match-program) cannot drift apart and promise the
 * visitor one program while assigning them another.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const { goal, experience, trainingDays, sex, equipment, estimatedWeeksToGoal, age } =
      (await req.json()) as MatchAnswers;

    if (!goal || !experience || !trainingDays) {
      return NextResponse.json({ error: 'Missing required fields: goal, experience, trainingDays' }, { status: 400 });
    }

    const program = await matchProgram({ goal, experience, trainingDays, sex, equipment, estimatedWeeksToGoal, age });
    if (!program) return NextResponse.json({ error: 'No programs available' }, { status: 500 });

    return NextResponse.json({ program });
  } catch (err: unknown) {
    console.error('[recommend-program] Error:', err);
    const message = err instanceof Error ? err.message : 'Program assignment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
