import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { isWhoopEnabled } from '@/lib/whoop';

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  if (!(await isWhoopEnabled(db))) {
    return NextResponse.json({ connected: false, disabled: true });
  }

  const doc = await db.collection('integrations').doc(check.uid).get();
  const whoop = doc.data()?.whoop as { connectedAt?: number; summary?: unknown } | undefined;

  if (!whoop) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, connectedAt: whoop.connectedAt ?? null, summary: whoop.summary ?? null });
}
