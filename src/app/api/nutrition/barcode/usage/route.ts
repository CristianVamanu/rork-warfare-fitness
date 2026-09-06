export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { getRemainingUsage, resolveConfiguredDailyLimit, resolveLocalDate } from '@/lib/usageLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';

const DEFAULT_DAILY_SCAN_LIMIT = 20;

// Separate from the main barcode route (which requires a ?code and always
// counts as a scan attempt) — this is a read-only check so the page can
// show "X left today" before the user has scanned anything.
export async function GET(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const dailyLimit = await resolveConfiguredDailyLimit(app, 'barcodeScanDailyLimit', DEFAULT_DAILY_SCAN_LIMIT);
  const remaining = await getRemainingUsage(app, authCheck.uid, 'barcode', dailyLimit, resolveLocalDate(req));
  return NextResponse.json({ remaining, dailyLimit });
}
