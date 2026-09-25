export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST {items:[{productId, variantId, quantity}]} → Stripe Checkout URL.
 *
 * Prices come from Firestore, never from the cart the browser sent. The
 * gate is enforced here: a product marked earned-only needs a signed-in
 * member with a verified finish in one of its challenges; a guest gets a
 * 401 that the page turns into "log in", a member without the finish gets
 * a 403 that names the challenge. Nothing about the storefront is trusted.
 *
 * The order document is created first, as pending_payment, and its id
 * travels in the session metadata; the Stripe webhook flips it to paid and
 * hands it to the provider. Abandoned checkouts leave a pending order
 * behind, which the admin list hides.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getShopConfig, verifiedChallengeIds, isUnlocked, newAccessToken } from '@/lib/shop/server';
import type { ShopOrderItem, ShopProduct } from '@/types';

const DEFAULT_SHIP_TO = ['US', 'CA', 'GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PL', 'PT', 'CZ', 'RO', 'HU', 'GR', 'AU', 'NZ'];

export async function POST(req: NextRequest) {
  const limit = await rateLimit({ scope: 'shop-checkout', key: clientIp(req), windowMs: 60_000, max: 20 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts — try again in a minute' }, { status: 429 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  // Optional auth: guests may buy anything that is not gated.
  let uid: string | null = null;
  if (req.headers.get('authorization')) {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
    uid = check.uid;
  }

  const body = await req.json().catch(() => null) as { items?: { productId?: string; variantId?: string; quantity?: number }[]; email?: string } | null;
  const raw = Array.isArray(body?.items) ? body!.items!.slice(0, 20) : [];
  if (raw.length === 0) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });

  const cfg = await getShopConfig(db);
  if (cfg.enabled === false || !cfg.provider) return NextResponse.json({ error: 'The store is not open yet' }, { status: 503 });

  const verified = uid ? await verifiedChallengeIds(db, uid) : [];
  const items: ShopOrderItem[] = [];
  for (const r of raw) {
    const qty = Math.max(1, Math.min(10, Math.round(Number(r.quantity) || 1)));
    if (!r.productId || !r.variantId) return NextResponse.json({ error: 'Bad cart item' }, { status: 400 });
    const snap = await db.collection('products').doc(r.productId).get();
    const p = snap.data() as ShopProduct | undefined;
    if (!snap.exists || !p || !p.active) return NextResponse.json({ error: 'An item in your cart is no longer available' }, { status: 400 });
    const v = (p.variants ?? []).find((x) => x.id === r.variantId && x.available !== false);
    if (!v) return NextResponse.json({ error: `${p.name}: that option is no longer available` }, { status: 400 });
    if (p.earnedOnly) {
      if (!uid) return NextResponse.json({ error: `${p.name} is earned, not given. Log in and finish a challenge to unlock it.`, code: 'login' }, { status: 401 });
      if (!isUnlocked(p, verified)) return NextResponse.json({ error: `${p.name} is earned, not given. Finish a challenge to unlock it.`, code: 'locked', unlockedBy: p.unlockedBy ?? [] }, { status: 403 });
    }
    if (p.provider !== cfg.provider) return NextResponse.json({ error: `${p.name} is not available with the current print provider` }, { status: 400 });
    items.push({
      productId: snap.id, name: p.name, variantId: v.id, variantLabel: v.label, quantity: qty,
      priceCents: v.priceCents ?? p.priceCents, ...(p.images?.[0] ? { image: p.images[0] } : {}), providerProductId: p.providerProductId, providerVariantId: v.providerVariantId,
      ...(v.printFileUrl ? { printFileUrl: v.printFileUrl } : {}),
      ...(v.providerStoreVariantId ? { providerStoreVariantId: v.providerStoreVariantId } : {}),
    });
  }
  if (items.some((i) => i.priceCents <= 0)) return NextResponse.json({ error: 'An item has no price yet — try again later' }, { status: 400 });

  const currency = (cfg.currency ?? 'USD').toUpperCase();
  const subtotal = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const shipping = Math.max(0, Math.round(cfg.shippingCents ?? 0));
  const total = subtotal + shipping;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const orderRef = db.collection('orders').doc();
  const accessToken = newAccessToken();
  await orderRef.set({
    userId: uid, email: '', items, subtotalCents: subtotal, shippingCents: shipping, totalCents: total, currency,
    status: 'pending_payment', provider: cfg.provider, accessToken, createdAt: FieldValue.serverTimestamp(),
  });

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        ...items.map((i) => ({
          quantity: i.quantity,
          price_data: {
            currency: currency.toLowerCase(), unit_amount: i.priceCents,
            product_data: { name: i.name, description: i.variantLabel, ...(i.image ? { images: [i.image] } : {}) },
          },
        })),
        ...(shipping > 0 ? [{ quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: shipping, product_data: { name: 'Shipping' } } }] : []),
      ],
      shipping_address_collection: { allowed_countries: (cfg.shipTo?.length ? cfg.shipTo : DEFAULT_SHIP_TO) as never },
      phone_number_collection: { enabled: true },
      ...(uid ? {} : { customer_creation: 'always' as const }),
      ...(body?.email && !uid ? { customer_email: body.email } : {}),
      allow_promotion_codes: true,
      metadata: { kind: 'shop_order', orderId: orderRef.id, ...(uid ? { userId: uid } : {}) },
      payment_intent_data: { metadata: { kind: 'shop_order', orderId: orderRef.id } },
      success_url: `${appUrl}/shop/orders/${orderRef.id}?t=${accessToken}&paid=1`,
      cancel_url: `${appUrl}/shop/cart`,
    });
    await orderRef.update({ stripeSessionId: session.id });
    return NextResponse.json({ url: session.url, orderId: orderRef.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[shop/checkout] stripe failed:', msg);
    await orderRef.delete().catch(() => {});
    return NextResponse.json({ error: 'Could not start checkout — try again' }, { status: 500 });
  }
}
