export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hourly cron (deploy.sh installs it, and runs it once right after each
 * deploy): asks the provider about every open order, then refreshes the
 * product catalogue. Webhooks carry the news first; this is what makes
 * "auto-updates" true even if a webhook was never registered or a delivery
 * was dropped — and it is what keeps product pictures and variants current
 * without anyone pressing Import. Secured by CRON_SECRET like the other jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { timingSafeEqualString } from '@/lib/crypto';
import { syncOpenOrders, importProducts, getShopConfig } from '@/lib/shop/server';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!timingSafeEqualString(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  try {
    const db = getAdminDb(app);
    const orders = await syncOpenOrders(db);
    // Only once a provider is configured; before that there is nothing to
    // import and the failure would just be noise in the cron log.
    let products: Awaited<ReturnType<typeof importProducts>> | { skipped: string } = { skipped: 'no provider configured' };
    if ((await getShopConfig(db)).provider) {
      try { products = await importProducts(db); }
      catch (err) { products = { skipped: err instanceof Error ? err.message : String(err) }; console.error('[shop/sync-orders] product refresh failed:', products.skipped); }
    }
    return NextResponse.json({ ok: true, ...orders, products });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[shop/sync-orders]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
