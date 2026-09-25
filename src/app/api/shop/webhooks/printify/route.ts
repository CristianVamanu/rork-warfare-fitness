export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Printify → us. Register in Printify (My Account → Connections → Webhooks,
 * or POST /v1/shops/{id}/webhooks.json) for order:updated and
 * order:shipment:created, pointing at /api/shop/webhooks/printify, with the
 * secret stored as PRINTIFY_WEBHOOK_SECRET. Signature: X-Pfy-Signature is
 * "sha256=" + HMAC-SHA256(secret, raw body).
 *
 * Orders are matched by Printify's own id; a webhook for an order we do
 * not know is answered 200 and ignored (a test order from the dashboard).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';
import { printifyStatus } from '@/lib/shop/providers';
import { applyProviderState, importProducts } from '@/lib/shop/server';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = await getSecret('PRINTIFY_WEBHOOK_SECRET').catch(() => '');
  if (!secret) return NextResponse.json({ error: 'PRINTIFY_WEBHOOK_SECRET not set' }, { status: 503 });
  const sig = (req.headers.get('x-pfy-signature') ?? '').replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  let evt: { type?: string; resource?: { id?: string; data?: { status?: string; shipment?: { carrier?: string; number?: string; url?: string } } } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  // product:publish:started / product:deleted — refresh the catalogue.
  if (typeof evt.type === 'string' && evt.type.startsWith('product:')) {
    const result = await importProducts(db).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ received: true, imported: result });
  }
  const providerOrderId = evt.resource?.id;
  if (!providerOrderId) return NextResponse.json({ received: true });

  const match = await db.collection('orders').where('providerOrderId', '==', providerOrderId).limit(1).get();
  const doc = match.docs[0];
  if (!doc) return NextResponse.json({ received: true, unknown: true });

  if (evt.type === 'order:shipment:created' && evt.resource?.data?.shipment) {
    const s = evt.resource.data.shipment;
    await applyProviderState(db, doc.id, { status: 'shipped', providerStatus: 'shipped', tracking: { carrier: s.carrier, number: s.number, url: s.url } });
  } else if (evt.resource?.data?.status) {
    const st = evt.resource.data.status;
    await applyProviderState(db, doc.id, { status: printifyStatus(st), providerStatus: st });
  }
  return NextResponse.json({ received: true });
}
