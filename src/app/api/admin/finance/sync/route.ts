export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/finance/sync  { full?: boolean }   (admins only)
 * Pulls customers, subscriptions, invoices, charges, refunds and disputes
 * from Stripe into the mirror. Records are keyed by Stripe id, so running it
 * repeatedly can never duplicate anything.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { audit, syncFromStripe } from '@/lib/finance/sync';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const lim = await rateLimit({ scope: 'finance-sync', key: auth.uid, windowMs: 60_000, max: 3 });
  if (!lim.allowed) return NextResponse.json({ error: 'Sync already running, try again in a minute' }, { status: 429 });
  const app = getAdminApp(); const db = app ? getAdminDb(app) : null;
  if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const body = await req.json().catch(() => ({})) as { full?: boolean };
  try {
    const res = await syncFromStripe(db, await getStripe(), { full: !!body.full });
    await audit(db, { uid: auth.uid, action: res.full ? 'finance.sync.full' : 'finance.sync', detail: res.counts });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error('[finance] sync failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 502 });
  }
}
