export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only audit: for every real program (Firestore `programs` collection,
 * not the built-in seed pool) and every exercise in it, checks whether the
 * exercise (a) has a muscleGroup tag and (b) has a matching demo video in
 * the real exerciseLibrary — the two things that can't be verified from the
 * codebase alone since both live only in this project's Firestore.
 * Never writes anything; the admin panel decides what to do with gaps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import type { Program, ExerciseVideo } from '@/types';

// Mirrors matchExercisesToVideos in src/lib/firestore.ts exactly (duplicated,
// not imported, since that file pulls in the client Firebase SDK which has
// no place in a server route) — otherwise this audit uses a looser/stricter
// match than what actually decides whether a video shows up in the app,
// and flags things as "missing" that the app itself already matches fine
// (e.g. plain substring containment misses "Push-Ups" vs "Push Up" on the
// hyphen alone; the word-overlap fallback below is what catches that).
const MATCH_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'for', 'to', 'on', 'of', 'in']);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !MATCH_STOPWORDS.has(w));
}

function nameSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shorter = setA.size <= setB.size ? setA : setB;
  const longer = setA.size <= setB.size ? setB : setA;
  let overlap = 0;
  shorter.forEach((word) => {
    if (longer.has(word)) overlap++;
  });
  return overlap / shorter.size;
}

function isVideoMatch(exerciseName: string, video: Pick<ExerciseVideo, 'name' | 'aliases'>): boolean {
  const normalized = exerciseName.toLowerCase().trim();
  const candidates = [video.name, ...(video.aliases ?? [])];
  for (const candidate of candidates) {
    const c = candidate.toLowerCase().trim();
    if (c === normalized || normalized.includes(c) || c.includes(normalized)) return true;
    if (nameSimilarity(normalized, c) >= 0.5) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const [programsSnap, librarySnap] = await Promise.all([
      db.collection('programs').get(),
      db.collection('exerciseLibrary').get(),
    ]);

    const library = librarySnap.docs.map((d) => d.data() as ExerciseVideo);
    const programs = programsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Program);

    const findings: {
      programId: string;
      programName: string;
      exerciseId: string;
      exerciseName: string;
      missingMuscleGroup: boolean;
      missingVideoMatch: boolean;
    }[] = [];

    for (const program of programs) {
      const exercises = program.schedule
        ? program.schedule.flatMap((d) => d.exercises ?? [])
        : (program.exercises ?? []);

      for (const ex of exercises) {
        const missingMuscleGroup = !ex.muscleGroup?.trim();
        const missingVideoMatch = !ex.isCardio && library.length > 0
          ? !library.some((v) => isVideoMatch(ex.name, v))
          : false;

        if (missingMuscleGroup || missingVideoMatch) {
          findings.push({
            programId: program.id,
            programName: program.name,
            exerciseId: ex.id,
            exerciseName: ex.name,
            missingMuscleGroup,
            missingVideoMatch,
          });
        }
      }
    }

    return NextResponse.json({
      programsChecked: programs.length,
      librarySize: library.length,
      findings,
    });
  } catch (err) {
    console.error('[program-health] Error:', err);
    const message = err instanceof Error ? err.message : 'Audit failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
