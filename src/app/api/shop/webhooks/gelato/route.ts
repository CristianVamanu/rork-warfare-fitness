export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Gelato → us. Register in the Gelato dashboard (Developer → Webhooks)
 * for order_status_updated and order_item_tracking_code_updated, URL
 * /api/shop/webhooks/gelato, and add a custom header
 * X-Webhook-Secret: <the value stored as GELATO_WEBHOOK_SECRET>.
 * Gelato has no HMAC signing; the shared header is the authentication.
 *
 * Orders are matched by orderReferenceId (our order id) first, Gelato's
 * orderId second.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';
import { timingSafeEqualString } from '@/lib/crypto';
import { gelatoStatus } from '@/lib/shop/providers';
import { applyProviderState, importProducts } from '@/lib/shop/server';

export async function POST(req: NextRequest) {
  const secret = await getSecret('GELATO_WEBHOOK_SECRET').catch(() => '');
  if (!secret) return NextResponse.json({ error: 'GELATO_WEBHOOK_SECRET not set' }, { status: 503 });
  const given = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!given || !timingSafeEqualString(given, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const evt = await req.json().catch(() => null) as {
    event?: string; orderId?: string; orderReferenceId?: string; fulfillmentStatus?: string;
    trackingCode?: string; trackingUrl?: string; shipmentMethodName?: string;
  } | null;
  if (!evt) return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });

  // Catalogue changes: publish, edit or delete a product in Gelato and the
  // shop follows without anyone pressing Import.
  if (typeof evt.event === 'string' && evt.event.startsWith('store_product')) {
    const result = await importProducts(db).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ received: true, imported: result });
  }

  let orderId: string | null = null;
  if (evt.orderReferenceId && (await db.collection('orders').doc(evt.orderReferenceId).get()).exists) orderId = evt.orderReferenceId;
  else if (evt.orderId) {
    const m = await db.collection('orders').where('providerOrderId', '==', evt.orderId).limit(1).get();
    orderId = m.docs[0]?.id ?? null;
  }
  if (!orderId) return NextResponse.json({ received: true, unknown: true });

  if (evt.event === 'order_item_tracking_code_updated' && (evt.trackingCode || evt.trackingUrl)) {
    await applyProviderState(db, orderId, { status: 'shipped', providerStatus: 'shipped', tracking: { carrier: evt.shipmentMethodName, number: evt.trackingCode, url: evt.trackingUrl } });
  } else if (evt.fulfillmentStatus) {
    await applyProviderState(db, orderId, { status: gelatoStatus(evt.fulfillmentStatus), providerStatus: evt.fulfillmentStatus });
  }
  return NextResponse.json({ received: true });
}
