export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { programPool } from '@/lib/programMatch';
import { getMockProgram } from '@/lib/programs';
import { pickNextProgram, completedProgramIds } from '@/lib/nextProgram';
import type { NextProgramPlan, Program } from '@/types';

/**
 * Decides, and records, the member's next program.
 *
 * Called by the client once the active program is in its last stretch
 * (see shouldPlanNext). Idempotent: a plan already made for the current
 * program is returned as-is, so two devices or a reload cannot flip the
 * choice under the member's feet. Writes with the Admin SDK, so the plan
 * is not something a client can forge.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const db = getAdminDb(app);
    const userRef = db.collection('users').doc(check.uid);
    const snap = await userRef.get();
    const data = snap.data() ?? {};
    const active = data.activeProgram as { programId?: string } | undefined;
    if (!active?.programId) return NextResponse.json({ error: 'No active program' }, { status: 400 });

    const existing = data.nextProgram as NextProgramPlan | undefined;
    if (existing?.forProgramId === active.programId) return NextResponse.json({ plan: existing, fresh: false });

    // The program being finished: an admin doc, a personal build, or a seed.
    const curSnap = await db.collection('programs').doc(active.programId).get();
    const current = (curSnap.exists ? { id: curSnap.id, ...curSnap.data() } : getMockProgram(active.programId)) as Program | null;
    if (!current) return NextResponse.json({ error: 'Active program not found' }, { status: 404 });

    const pool = await programPool();
    const pick = pickNextProgram({
      pool,
      current,
      completedIds: completedProgramIds({
        programProgress: data.programProgress as Record<string, { completedWorkouts?: number; totalWorkouts?: number }> | undefined,
        celebratedPrograms: data.celebratedPrograms as string[] | undefined,
      }),
      goal: (data.fitnessGoal as string) ?? 'general',
      experience: (data.experience as string) ?? current.level,
      trainingDays: Number(data.trainingDays) || current.daysPerWeek,
      sex: data.sex as string | undefined,
      equipment: data.equipment as string | undefined,
      age: typeof data.age === 'number' ? data.age : undefined,
    });
    if (!pick) return NextResponse.json({ error: 'No programs available' }, { status: 404 });

    const plan: NextProgramPlan = {
      programId: pick.program.id,
      programName: pick.program.name,
      weeks: pick.program.weeks,
      daysPerWeek: pick.program.daysPerWeek,
      forProgramId: active.programId,
      decidedAt: FieldValue.serverTimestamp(),
      reason: pick.reason,
    };
    await userRef.set({ nextProgram: plan }, { merge: true });
    return NextResponse.json({ plan: { ...plan, decidedAt: Date.now() }, fresh: true });
  } catch (err) {
    console.error('[programs/next] Error:', err);
    return NextResponse.json({ error: 'Could not plan the next program' }, { status: 500 });
  }
}
