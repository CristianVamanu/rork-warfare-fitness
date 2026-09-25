export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hourly cron (deploy.sh installs it): asks the provider about every open
 * order. Webhooks carry the news first; this is what makes "auto-updates"
 * true even if a webhook was never registered or a delivery was dropped.
 * Secured by CRON_SECRET like the other jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { timingSafeEqualString } from '@/lib/crypto';
import { syncOpenOrders } from '@/lib/shop/server';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!timingSafeEqualString(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  try {
    const result = await syncOpenOrders(getAdminDb(app));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[shop/sync-orders]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
