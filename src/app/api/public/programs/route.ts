export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public program list for the logged-out landing page — no auth required.
 * Merges published Firestore programs with the built-in seed programs
 * (MOCK_PROGRAMS) exactly like the admin list does, so newly-admin-edited
 * programs show immediately and un-edited seed programs still show up
 * without requiring an admin to have touched them first.
 *
 * Unauthenticated and previously uncached and unlimited — each hit read the
 * whole public programs collection plus three config docs. Cached for a
 * minute (five at a CDN) and rate limited per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import type { Program } from '@/types';

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET(req: NextRequest) {
  try {
    const limit = await rateLimit({ scope: 'public-programs', key: clientIp(req), windowMs: 60_000, max: 30 });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }

    const app = getAdminApp();
    let firestorePrograms: Program[] = [];
    let hiddenIds = new Set<string>();
    let deletedIds = new Set<string>();
    let programsToShow = 0;

    if (app) {
      const db = getAdminDb(app);
      const [progsSnap, hiddenSnap, deletedSnap, configSnap] = await Promise.all([
        db.collection('programs').where('isPublic', '==', true).get(),
        db.collection('config').doc('hiddenMocks').get(),
        db.collection('config').doc('deletedMocks').get(),
        db.collection('system').doc('config').get(),
      ]);
      firestorePrograms = progsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Program, 'id'>) }))
        .filter((p) => (p as Program & { visibility?: string }).visibility !== 'coaching');
      hiddenIds = new Set((hiddenSnap.data()?.ids as string[]) ?? []);
      deletedIds = new Set((deletedSnap.data()?.ids as string[]) ?? []);
      programsToShow = (configSnap.data()?.landingPage?.programsToShow as number) || 0;
    }

    const fpIds = new Set(firestorePrograms.map((p) => p.id));
    const mocks = MOCK_PROGRAMS.filter((p) => !fpIds.has(p.id) && !hiddenIds.has(p.id) && !deletedIds.has(p.id));

    let programs = [...firestorePrograms, ...mocks].map((p) => ({
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

    if (programsToShow > 0) programs = programs.slice(0, programsToShow);

    return NextResponse.json({ programs }, { headers: { 'Cache-Control': CACHE } });
  } catch (err) {
    console.error('[public/programs] Error:', err);
    return NextResponse.json({ programs: [] });
  }
}
