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

/**
 * Challenge ids this member has a verified finish in.
 *
 * Read from users/{uid}.challengeBadges, which the review route stamps on
 * every verification (and removes on a reversal), rather than a collection
 * group query over entries: that query needs a composite index that is not
 * deployed, and a gate that throws FAILED_PRECONDITION is a gate that
 * refuses everyone. One document read, no index, same answer.
 */
export async function verifiedChallengeIds(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection('users').doc(uid).get();
  const badges = snap.data()?.challengeBadges;
  return Array.isArray(badges) ? badges.map((b: { challengeId?: string }) => b?.challengeId).filter((x): x is string => typeof x === 'string') : [];
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

// ── Import ───────────────────────────────────────────────────────────────

/** cost × (1 + markup%), rounded up to the nearest .99. */
export function retailFromCost(costCents: number, markupPercent: number): number {
  const raw = costCents * (1 + Math.max(0, markupPercent) / 100);
  return Math.max(99, Math.ceil(raw / 100) * 100 - 1);
}

/**
 * Pulls the provider's catalogue into products/. Idempotent, so it runs
 * from the admin button and from the provider's product webhooks alike:
 * publish in Gelato, and the shop has it seconds later.
 *
 *   new product      → created, priced (provider retail, else cost×markup),
 *                      on the shelf if autoActivate and it has a price
 *   existing product → provider fields refreshed (variants, images when we
 *                      have none, description when we have none); the
 *                      admin's own price, slug, gate and shelf flag kept;
 *                      a product still at price 0 gets the computed one
 *   gone from provider → left alone (admin removes it), but its variants
 *                      are marked unavailable so it cannot be bought
 */
export async function importProducts(db: Firestore): Promise<{ found: number; created: number; updated: number; unavailable: number }> {
  const cfg = await getShopConfig(db);
  const provider = await providerFor(db, cfg);
  const currency = (cfg.currency ?? 'USD').toUpperCase();
  const country = (cfg.pricingCountry ?? cfg.shipTo?.[0] ?? 'US').toUpperCase();
  const markup = typeof cfg.markupPercent === 'number' ? cfg.markupPercent : 100;
  const autoActivate = cfg.autoActivate !== false;

  const found = await provider.listProducts({ country, currency });
  const existing = await db.collection('products').where('provider', '==', provider.id).get();
  const byPid = new Map(existing.docs.map((d) => [(d.data() as ShopProduct).providerProductId, d]));
  const seen = new Set<string>();
  let created = 0, updated = 0, unavailable = 0;

  const priceVariants = (variants: ShopProduct['variants']) => variants.map((v) => {
    if (v.priceCents && v.priceCents > 0) return v;
    if (typeof v.costCents === 'number' && v.costCents > 0) return { ...v, priceCents: retailFromCost(v.costCents, markup) };
    return v;
  });
  const basePrice = (variants: ShopProduct['variants'], fallback: number) => {
    const priced = variants.map((v) => v.priceCents ?? 0).filter((n) => n > 0);
    return priced.length ? Math.min(...priced) : fallback;
  };

  for (const p of found) {
    seen.add(p.providerProductId);
    const cur = byPid.get(p.providerProductId);
    if (cur) {
      const c = cur.data() as ShopProduct;
      // Provider fields are the provider's truth; anything the admin typed
      // (a price override, a print file) survives the refresh.
      const variants = priceVariants(p.variants.map((v) => {
        const mine = (c.variants ?? []).find((x) => x.providerVariantId === v.providerVariantId || (x.providerStoreVariantId && x.providerStoreVariantId === v.providerStoreVariantId));
        return {
          ...v,
          ...(mine?.priceCents !== undefined && mine.priceCents > 0 ? { priceCents: mine.priceCents } : {}),
          ...(mine?.printFileUrl ? { printFileUrl: mine.printFileUrl } : {}),
          ...(mine?.available === false ? { available: false } : {}),
        };
      }));
      const priceCents = c.priceCents > 0 ? c.priceCents : basePrice(variants, p.priceCents);
      await cur.ref.update({
        variants, priceCents,
        ...(c.category ? {} : { category: p.category }),
        images: c.images?.length ? c.images : p.images,
        ...(c.description ? {} : { description: p.description ?? '' }),
        ...(!c.active && autoActivate && priceCents > 0 && !c.updatedAt ? { active: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated += 1;
    } else {
      const variants = priceVariants(p.variants);
      const priceCents = basePrice(variants, p.priceCents);
      await db.collection('products').add({
        slug: await uniqueSlug(db, p.name), name: p.name, description: p.description ?? '', images: p.images, category: p.category,
        priceCents, currency,
        provider: provider.id, providerProductId: p.providerProductId, variants,
        earnedOnly: false, unlockedBy: [], active: autoActivate && priceCents > 0, sortOrder: 100,
        createdAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }
  // Products the provider no longer lists cannot be printed; keep the
  // document (its gate and history) but nothing on it can be bought.
  for (const d of existing.docs) {
    const c = d.data() as ShopProduct;
    if (seen.has(c.providerProductId) || !c.active) continue;
    await d.ref.update({ active: false, updatedAt: FieldValue.serverTimestamp() });
    unavailable += 1;
  }
  return { found: found.length, created, updated, unavailable };
}

/** Public shape of a product: everything a storefront needs, nothing else. */
export function publicProduct(id: string, p: ShopProduct) {
  return {
    id, slug: p.slug, name: p.name, description: p.description ?? '', images: p.images ?? [], category: p.category ?? 'Gear',
    priceCents: p.priceCents, currency: p.currency, earnedOnly: !!p.earnedOnly, unlockedBy: p.unlockedBy ?? [],
    createdAt: (p.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
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
