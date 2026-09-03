export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Today's app-wide AI usage, for the admin dashboard's budget meter.
 *
 * Counting happens inside the same transaction that reserves each user's own
 * daily slot (see checkAndIncrementUsage), so this reads a value that is
 * always consistent with what was actually spent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp } from '@/lib/firebase-admin';
import { getOrgAiUsage } from '@/lib/usageLimit';

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    return NextResponse.json(await getOrgAiUsage(app));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read AI usage';
    console.error('[ai-usage] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
