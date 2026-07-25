export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public program list for the logged-out landing page — no auth required.
 * Merges published Firestore programs with the built-in seed programs
 * (MOCK_PROGRAMS) exactly like the admin list does, so newly-admin-edited
 * programs show immediately and un-edited seed programs still show up
 * without requiring an admin to have touched them first.
 */

import { NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS } from '@/lib/programs';
import type { Program } from '@/types';

export async function GET() {
  try {
    const app = getAdminApp();
    let firestorePrograms: Program[] = [];
    let hiddenIds = new Set<string>();

    if (app) {
      const db = getAdminDb(app);
      const [progsSnap, hiddenSnap] = await Promise.all([
        db.collection('programs').where('isPublic', '==', true).get(),
        db.collection('config').doc('hiddenMocks').get(),
      ]);
      firestorePrograms = progsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Program, 'id'>) }))
        .filter((p) => (p as Program & { visibility?: string }).visibility !== 'coaching');
      hiddenIds = new Set((hiddenSnap.data()?.ids as string[]) ?? []);
    }

    const fpIds = new Set(firestorePrograms.map((p) => p.id));
    const mocks = MOCK_PROGRAMS.filter((p) => !fpIds.has(p.id) && !hiddenIds.has(p.id));

    const programs = [...firestorePrograms, ...mocks].map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      level: p.level,
      goal: p.goal,
      weeks: p.weeks,
      daysPerWeek: p.daysPerWeek,
      imageUrl: p.imageUrl ?? null,
      targetGender: p.targetGender ?? 'anyone',
    }));

    return NextResponse.json({ programs });
  } catch (err) {
    console.error('[public/programs] Error:', err);
    return NextResponse.json({ programs: [] });
  }
}
