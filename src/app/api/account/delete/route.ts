export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Self-service account deletion — GDPR right-to-erasure, available to any
 * signed-in user for their own account, no admin involvement required. */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { deleteUserCompletely } from '@/lib/accountDeletion';

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const summary = await deleteUserCompletely(app, db, check.uid);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[account/delete] Error:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
