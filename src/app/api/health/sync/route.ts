export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { HEART_FIELDS } from '@/lib/healthHeart';

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
  start: z.string().datetime({ offset: true }).optional().catch(undefined),
  kcal: z.coerce.number().int().min(0).max(20000).optional(),
  source: z.string().trim().max(80).optional(),
}).strip();

// One odd reading (a watch glitch) must not reject the whole sync: an
// out-of-range number is dropped for that day instead.
const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.coerce.number().int().min(0).max(200000).optional().catch(undefined),
  sleepMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().catch(undefined),
  avgHeartRate: z.coerce.number().int().min(20).max(250).optional().catch(undefined),
  restingHeartRate: z.coerce.number().int().min(20).max(250).optional().catch(undefined),
  weightKg: z.coerce.number().min(20).max(400).optional().catch(undefined),
  activeKcal: z.coerce.number().int().min(0).max(20000).optional().catch(undefined),
  totalKcal: z.coerce.number().int().min(0).max(30000).optional().catch(undefined),
  minHeartRate: z.coerce.number().int().min(20).max(250).optional().catch(undefined),
  hrvMs: z.coerce.number().int().min(1).max(400).optional().catch(undefined),
  deepMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().catch(undefined),
  remMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().catch(undefined),
  lightMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().catch(undefined),
  awakeMinutes: z.coerce.number().int().min(0).max(24 * 60).optional().catch(undefined),
  workouts: z.array(Workout).max(30).optional().catch(undefined),
  source: z.enum(['healthkit', 'healthconnect']),
}).strip();

const Body = z.object({ days: z.array(Day).min(1).max(31) });

export async function POST(req: NextRequest) {
  const auth = await verifyAuthedNotTfaPending(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // The app syncs on dashboard open and on a manual tap; anything past this
  // is a script, and each request can write up to 31 documents.
  const limit = await rateLimit({ scope: 'health-sync', key: auth.uid, windowMs: 60_000, max: 12 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many syncs, try again in a minute' }, { status: 429 });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  let parsed;
  try { parsed = Body.safeParse(await req.json()); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: 'Invalid health payload' }, { status: 400 });
  // Real dates only, and only the recent window the app reads (plus a day of
  // time-zone slack): no minting documents for 9999-99-99 or for years back.
  const now = Date.now();
  for (const day of parsed.data.days) {
    const t = Date.parse(`${day.date}T12:00:00Z`);
    if (Number.isNaN(t) || t > now + 2 * 86400_000 || t < now - 40 * 86400_000) {
      return NextResponse.json({ error: `Date out of range: ${day.date}` }, { status: 400 });
    }
  }

  const db = getAdminDb(app);
  const batch = db.batch();
  for (const day of parsed.data.days) {
    // Drop empty fields so a day with no watch data doesn't overwrite an
    // earlier sync that had some.
    const fields: Record<string, unknown> = Object.fromEntries(Object.entries(day).filter(([, v]) => v !== undefined));
    // Android no longer reads heart data: ignore it from older builds and
    // remove what earlier syncs stored for this day.
    if (day.source === 'healthconnect') for (const f of HEART_FIELDS) fields[f] = FieldValue.delete();
    batch.set(db.collection('healthDays').doc(`${auth.uid}_${day.date}`), {
      ...fields,
      userId: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return NextResponse.json({ ok: true, saved: parsed.data.days.length });
}
