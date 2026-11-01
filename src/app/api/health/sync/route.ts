export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';

/**
 * Receives the per-day wearable summaries the native app builds from Apple
 * Health / Health Connect (src/lib/native/health.ts) and stores them under
 * healthDays/{uid}_{date}. Server-only writes: the client can read its own
 * docs (firestore.rules) but every write comes through here so the shape is
 * checked and a user cannot plant values on someone else's day.
 *
 * Idempotent: the phone re-sends the last few days on every sync and the
 * newest values simply replace the old ones for that date.
 */
const Workout = z.object({
  type: z.string().trim().min(1).max(60),
  minutes: z.coerce.number().int().min(0).max(24 * 60),
  kcal: z.coerce.number().int().min(0).max(20000).optional(),
  source: z.string().trim().max(80).optional(),
}).strip();

const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.coerce.number().int().min(0).max(200000).optional(),
  sleepMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  avgHeartRate: z.coerce.number().int().min(20).max(250).optional(),
  restingHeartRate: z.coerce.number().int().min(20).max(250).optional(),
  weightKg: z.coerce.number().min(20).max(400).optional(),
  activeKcal: z.coerce.number().int().min(0).max(20000).optional(),
  workouts: z.array(Workout).max(30).optional(),
  source: z.enum(['healthkit', 'healthconnect']),
}).strip();

const Body = z.object({ days: z.array(Day).min(1).max(31) });

export async function POST(req: NextRequest) {
  const auth = await verifyAuthedNotTfaPending(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'Invalid health payload' }, { status: 400 });

  const db = getAdminDb(app);
  const batch = db.batch();
  for (const day of parsed.data.days) {
    // Drop empty fields so a day with no watch data doesn't overwrite an
    // earlier sync that had some.
    const fields = Object.fromEntries(Object.entries(day).filter(([, v]) => v !== undefined));
    batch.set(db.collection('healthDays').doc(`${auth.uid}_${day.date}`), {
      ...fields,
      userId: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return NextResponse.json({ ok: true, saved: parsed.data.days.length });
}
