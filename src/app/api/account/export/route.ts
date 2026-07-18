export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Self-service data export — GDPR data portability. Returns everything
 * the app holds about the requesting user as a downloadable JSON file. */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { exportUserData } from '@/lib/accountDeletion';

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const data = await exportUserData(db, check.uid);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="warfare-fitness-data-${check.uid}.json"`,
      },
    });
  } catch (err) {
    console.error('[account/export] Error:', err);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
