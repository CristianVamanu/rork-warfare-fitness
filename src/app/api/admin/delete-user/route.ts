export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { deleteUserCompletely } from '@/lib/accountDeletion';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId } = await req.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (userId === check.uid) return NextResponse.json({ error: "You can't delete your own admin account from here" }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const summary = await deleteUserCompletely(app, db, userId);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[admin/delete-user] Error:', err);
    return NextResponse.json({ error: 'Failed to fully delete user' }, { status: 500 });
  }
}
