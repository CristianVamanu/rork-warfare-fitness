import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS, pickBestProgram } from '@/lib/programs';
import type { Program } from '@/types';

/**
 * Assigns a user into the best-fit existing program rather than generating
 * one from scratch with AI. Pulls the pool from admin-created public
 * programs (Firestore `programs` collection, isPublic: true) first, falling
 * back to the built-in seed library if the admin hasn't created any yet.
 * Deterministic and instant — no OpenAI call, no per-user program-quality
 * variance, and every plan a real human actually designed.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const body = await req.json();
    const { goal, experience, trainingDays } = body as {
      goal: string;
      experience: string;
      trainingDays: number;
    };

    if (!goal || !experience || !trainingDays) {
      return NextResponse.json({ error: 'Missing required fields: goal, experience, trainingDays' }, { status: 400 });
    }

    const db = getAdminDb(app);
    const snap = await db.collection('programs').where('isPublic', '==', true).get();
    const adminPrograms = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);

    const pool = adminPrograms.length > 0 ? adminPrograms : MOCK_PROGRAMS;
    const program = pickBestProgram(pool, goal, experience, trainingDays);

    if (!program) {
      return NextResponse.json({ error: 'No programs available' }, { status: 500 });
    }

    return NextResponse.json({
      program: {
        id: program.id,
        name: program.name,
        description: program.description,
        weeks: program.weeks,
        daysPerWeek: program.daysPerWeek,
      },
    });
  } catch (err: unknown) {
    console.error('[recommend-program] Error:', err);
    const message = err instanceof Error ? err.message : 'Program assignment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
