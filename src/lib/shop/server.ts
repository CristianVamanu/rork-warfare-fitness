/**
 * Store, server side: config, the "earned, not given" gate, placing an
 * order with the provider, and pulling its status back.
 *
 * Everything here runs with firebase-admin. The client never touches
 * orders directly (rules allow a member to read their own, nothing more).
 */

import { randomBytes } from 'crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { makeProvider, type PodProvider } from './providers';
import { sendEmail } from '@/lib/email';
import type { ShopConfig, ShopOrder, ShopOrderStatus, ShopProduct } from '@/types';

export const TERMINAL: ShopOrderStatus[] = ['delivered', 'cancelled'];

export async function getShopConfig(db: Firestore): Promise<ShopConfig> {
  const snap = await db.collection('system').doc('config').get();
  return ((snap.data()?.shop as ShopConfig | undefined) ?? {});
}

export async function providerFor(db: Firestore, cfg?: ShopConfig): Promise<PodProvider> {
  const c = cfg ?? await getShopConfig(db);
  if (!c.provider) throw new Error('No print provider selected (Admin → Store → Settings)');
  return makeProvider(c.provider, c);
}

export function newAccessToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Slug from a name, unique within products. */
export async function uniqueSlug(db: Firestore, name: string, exceptId?: string): Promise<string> {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'item';
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const clash = await db.collection('products').where('slug', '==', slug).limit(1).get();
    if (clash.empty || clash.docs[0].id === exceptId) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

// ── The gate ─────────────────────────────────────────────────────────────

/** Challenge ids this member has a verified finish in. */
export async function verifiedChallengeIds(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.collectionGroup('entries').where('userId', '==', uid).where('status', '==', 'verified').get();
  return snap.docs.map((d) => d.ref.parent.parent?.id).filter((x): x is string => !!x);
}

export function isUnlocked(product: Pick<ShopProduct, 'earnedOnly' | 'unlockedBy'>, verified: string[]): boolean {
  if (!product.earnedOnly) return true;
  const by = product.unlockedBy ?? [];
  return by.length === 0 ? verified.length > 0 : by.some((id) => verified.includes(id));
}

// ── Orders ───────────────────────────────────────────────────────────────

/**
 * Places a paid order with the provider and records the result. Safe to
 * call again on a failed order (the admin's Retry): an order that already
 * has a providerOrderId is left alone, so a retry can never print twice.
 */
export async function placeProviderOrder(db: Firestore, orderId: string): Promise<ShopOrder> {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  const order = { id: snap.id, ...snap.data() } as ShopOrder;
  if (!snap.exists) throw new Error('Order not found');
  if (order.providerOrderId) return order;
  if (order.status !== 'paid' && order.status !== 'failed') throw new Error(`Order is ${order.status}, not paid`);

  try {
    const provider = await providerFor(db);
    const placed = await provider.createOrder(order);
    await ref.update({
      status: 'submitted', providerOrderId: placed.providerOrderId, providerStatus: placed.providerStatus,
      provider: provider.id, error: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...order, status: 'submitted', providerOrderId: placed.providerOrderId, providerStatus: placed.providerStatus };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The money is taken and the order is real; only the hand-off failed.
    // 'failed' puts it at the top of the admin list with the reason, and
    // Retry calls this again once the cause (usually a key or a missing
    // print file) is fixed.
    await ref.update({ status: 'failed', error: msg.slice(0, 500), updatedAt: FieldValue.serverTimestamp() });
    console.error(`[shop] provider order failed for ${orderId}:`, msg);
    return { ...order, status: 'failed', error: msg };
  }
}

/** Applies a provider status to an order, with the timestamps the order
 *  page shows. Idempotent: the same status twice writes nothing new. */
export async function applyProviderState(db: Firestore, orderId: string, state: { status: ShopOrderStatus; providerStatus?: string; tracking?: ShopOrder['tracking'] }) {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const cur = snap.data() as ShopOrder;
  const patch: Record<string, unknown> = {};
  if (state.providerStatus && state.providerStatus !== cur.providerStatus) patch.providerStatus = state.providerStatus;
  if (state.status !== cur.status && cur.status !== 'cancelled') {
    patch.status = state.status;
    if (state.status === 'shipped' && !cur.shippedAt) patch.shippedAt = FieldValue.serverTimestamp();
  }
  const t = state.tracking;
  if (t && (t.url || t.number) && (t.url !== cur.tracking?.url || t.number !== cur.tracking?.number)) {
    patch.tracking = { ...(t.carrier ? { carrier: t.carrier } : {}), ...(t.number ? { number: t.number } : {}), ...(t.url ? { url: t.url } : {}) };
  }
  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = FieldValue.serverTimestamp();
  await ref.update(patch);

  // One email when it ships — the moment people actually want to hear about.
  if (patch.status === 'shipped' && cur.email) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/shop/orders/${orderId}?t=${cur.accessToken}`;
    const tracking = patch.tracking as ShopOrder['tracking'] | undefined ?? cur.tracking;
    await sendEmail({
      to: cur.email,
      subject: 'Your Warfare Fitness order has shipped',
      html: `<p>It's on the way.</p>${tracking?.url ? `<p><a href="${tracking.url}">Track your parcel</a>${tracking.number ? ` — ${tracking.number}` : ''}</p>` : ''}<p><a href="${link}">Order details</a></p>`,
    }).catch(() => {});
  }
}

/** Polls the provider for every order that is out of our hands and not
 *  done. The hourly cron calls this; webhooks make it mostly a no-op. */
export async function syncOpenOrders(db: Firestore): Promise<{ checked: number; changed: number }> {
  const cfg = await getShopConfig(db);
  if (!cfg.provider) return { checked: 0, changed: 0 };
  const provider = makeProvider(cfg.provider, cfg);
  const open = await db.collection('orders').where('status', 'in', ['submitted', 'in_production', 'shipped']).limit(200).get();
  let changed = 0;
  for (const d of open.docs) {
    const o = d.data() as ShopOrder;
    if (!o.providerOrderId || o.provider !== provider.id) continue;
    try {
      const state = await provider.getOrder(o.providerOrderId);
      if (state.status !== o.status || state.providerStatus !== o.providerStatus || (state.tracking?.url && state.tracking.url !== o.tracking?.url)) {
        await applyProviderState(db, d.id, state);
        changed += 1;
      }
    } catch (err) {
      console.error(`[shop] sync failed for ${d.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { checked: open.size, changed };
}

/** Public shape of a product: everything a storefront needs, nothing else. */
export function publicProduct(id: string, p: ShopProduct) {
  return {
    id, slug: p.slug, name: p.name, description: p.description ?? '', images: p.images ?? [],
    priceCents: p.priceCents, currency: p.currency, earnedOnly: !!p.earnedOnly, unlockedBy: p.unlockedBy ?? [],
    variants: (p.variants ?? []).filter((v) => v.available !== false).map((v) => ({ id: v.id, label: v.label, priceCents: v.priceCents ?? p.priceCents })),
  };
}
export type PublicProduct = ReturnType<typeof publicProduct>;

/** What a member (or a guest with the token) may see of an order. */
export function publicOrder(o: ShopOrder) {
  return {
    id: o.id, status: o.status, items: o.items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, quantity: i.quantity, priceCents: i.priceCents, image: i.image ?? null })),
    subtotalCents: o.subtotalCents, shippingCents: o.shippingCents, totalCents: o.totalCents, currency: o.currency,
    tracking: o.tracking ?? null, shipping: o.shipping ? { name: o.shipping.name, city: o.shipping.city, country: o.shipping.country } : null,
    createdAt: (o.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
    shippedAt: (o.shippedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
    error: o.status === 'failed' ? 'We hit a snag sending this to production. It is being looked at; you will not be charged twice.' : null,
  };
}
