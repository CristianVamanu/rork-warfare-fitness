export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read or replace today's daily brief, from the admin panel.
 *
 * An override, not a replacement for the automatic one. The brief is still
 * written by itself on the first dashboard request of each new day; this is
 * for the day it comes out badly, and for seeing what members are currently
 * being shown without opening Firestore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { todayKey, readStoredTip, generateAndStoreTip, topicFor } from '@/lib/dailyTip';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const dateKey = todayKey();
  const tip = await readStoredTip(getAdminDb(app), dateKey);
  return NextResponse.json({
    date: dateKey,
    topic: topicFor(dateKey),
    // Null means nobody has opened the dashboard yet today, so the brief has
    // not been written. Worth saying rather than showing an empty box.
    tip,
  });
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const db = getAdminDb(app);
  const dateKey = todayKey();

  // The tip being replaced is passed as something to avoid. Without it, the
  // model has no memory between calls and can hand back the very sentence the
  // button was pressed to get rid of.
  const current = await readStoredTip(db, dateKey);
  const { tip, generated } = await generateAndStoreTip(db, dateKey, current);

  if (!generated) {
    return NextResponse.json(
      { error: 'Could not reach the writing service. Check the OpenAI key in Integrations.', tip },
      { status: 502 },
    );
  }
  return NextResponse.json({ tip, date: dateKey });
}
