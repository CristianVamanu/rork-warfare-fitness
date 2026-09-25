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
import { isMirrored, mirrorImages } from './images';
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
  // Only one caller talks to the provider for a given order: the webhook,
  // an admin Retry and the hourly sync can overlap, and each would place
  // its own copy. A short lease on the order document decides who goes.
  const claimed = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as (ShopOrder & { placingUntil?: number }) | undefined;
    if (!d || d.providerOrderId) return false;
    if (d.placingUntil && d.placingUntil > Date.now()) return false;
    tx.update(ref, { placingUntil: Date.now() + 5 * 60_000 });
    return true;
  });
  if (!claimed) return order;

  try {
    const provider = await providerFor(db);
    // The item ids in the order belong to the provider it was bought under.
    // Switching providers in Settings must not send Gelato ids to Printify.
    if (order.provider && order.provider !== provider.id) throw new Error(`Order was placed for ${order.provider}; the store is now set to ${provider.id}. Switch back to retry it.`);
    const placed = await provider.createOrder(order);
    await ref.update({
      status: 'submitted', providerOrderId: placed.providerOrderId, providerStatus: placed.providerStatus,
      provider: provider.id, error: FieldValue.delete(), placingUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...order, status: 'submitted', providerOrderId: placed.providerOrderId, providerStatus: placed.providerStatus };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The money is taken and the order is real; only the hand-off failed.
    // 'failed' puts it at the top of the admin list with the reason, and
    // Retry calls this again once the cause (usually a key or a missing
    // print file) is fixed.
    await ref.update({ status: 'failed', error: msg.slice(0, 500), placingUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
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
  // Provider events can arrive out of order (an item-level "in production"
  // after the parcel's "shipped"); the order never moves backwards, only
  // forwards, or sideways into cancelled/failed.
  const RANK: Partial<Record<ShopOrderStatus, number>> = { paid: 1, submitted: 2, in_production: 3, shipped: 4, delivered: 5 };
  const forwards = (RANK[state.status] ?? 0) > (RANK[cur.status] ?? 0) || state.status === 'cancelled' || state.status === 'failed';
  if (state.status !== cur.status && cur.status !== 'cancelled' && forwards) {
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
      html: `<p>Order <b>#${orderId.slice(0, 8).toUpperCase()}</b> is on the way.</p>${tracking?.url ? `<p><a href="${tracking.url}">Track your parcel with the carrier</a>${tracking.number ? ` — ${tracking.number}` : ''}</p>` : ''}<p><a href="${link}">Order details</a></p>`,
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

/** Abandoned checkouts: a pending_payment order older than a day whose
 *  Stripe session has long expired. Deleted so the collection does not
 *  fill with carts nobody paid for. */
export async function expirePendingOrders(db: Firestore): Promise<number> {
  // One equality filter only: status + createdAt together would need a
  // composite index that is not deployed, and a query that throws inside
  // the cron would silently never clean anything.
  const cutoff = Date.now() - 24 * 3600_000;
  const snap = await db.collection('orders').where('status', '==', 'pending_payment').limit(500).get();
  let removed = 0;
  for (const d of snap.docs) {
    const created = (d.data().createdAt as { toMillis?: () => number } | undefined)?.toMillis?.();
    if (created !== undefined && created < cutoff) { await d.ref.delete(); removed += 1; }
  }
  return removed;
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
type ImportResult = { found: number; created: number; updated: number; unavailable: number };

/**
 * One import at a time across both pm2 workers. Gelato sends a burst of
 * store_product events when a product is published, and retries slow
 * deliveries; overlapping imports each saw "no product yet" and created
 * duplicates. A Firestore lease serialises them: a caller that finds the
 * lease held marks a re-run and returns, and the holder imports once more
 * before letting go, so a product published mid-import is never missed.
 */
export async function importProducts(db: Firestore): Promise<ImportResult | { queued: true }> {
  const lockRef = db.collection('system').doc('shopImportLock');
  const LEASE_MS = 10 * 60_000;
  const got = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(lockRef)).data() as { until?: number } | undefined;
    if (cur?.until && cur.until > Date.now()) { tx.set(lockRef, { rerun: true }, { merge: true }); return false; }
    tx.set(lockRef, { until: Date.now() + LEASE_MS, rerun: false });
    return true;
  });
  if (!got) return { queued: true };
  try {
    let result = await importProductsOnce(db);
    for (let i = 0; i < 3; i++) {
      const again = await db.runTransaction(async (tx) => {
        const cur = (await tx.get(lockRef)).data() as { rerun?: boolean } | undefined;
        if (!cur?.rerun) return false;
        tx.set(lockRef, { until: Date.now() + LEASE_MS, rerun: false });
        return true;
      });
      if (!again) break;
      result = await importProductsOnce(db);
    }
    return result;
  } finally {
    await lockRef.set({ until: 0, rerun: false }).catch(() => {});
  }
}

async function importProductsOnce(db: Firestore): Promise<ImportResult> {
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
      // Pricing: a price the admin typed (priceCustom) is the product's
      // price for every option. Otherwise every option is re-priced from
      // the provider's current cost and the current markup, so changing the
      // markup in Settings, or Gelato changing its cost, reaches the shelf
      // on the next import.
      const merged = p.variants.map((v) => {
        const mine = (c.variants ?? []).find((x) => x.providerVariantId === v.providerVariantId || (x.providerStoreVariantId && x.providerStoreVariantId === v.providerStoreVariantId));
        return {
          ...v,
          ...(mine?.printFileUrl ? { printFileUrl: mine.printFileUrl } : {}),
          ...(mine?.available === false ? { available: false } : {}),
        };
      });
      const variants = c.priceCustom
        ? merged.map(({ priceCents: _drop, ...v }) => v)
        : priceVariants(merged);
      const priceCents = c.priceCustom && c.priceCents > 0 ? c.priceCents : basePrice(variants, c.priceCents > 0 ? c.priceCents : p.priceCents);
      // Pictures already on our storage are the admin's (or an earlier
      // mirror) and stay. Anything else is a provider link that may have
      // expired since the last import — it did, for Gelato — so the
      // provider's current list is mirrored afresh.
      const ours = (c.images ?? []).length > 0 && (c.imagesCustom || (await Promise.all((c.images ?? []).map(isMirrored))).every(Boolean));
      const images = ours ? c.images : await mirrorImages(p.images, p.providerProductId);
      await cur.ref.update({
        variants, priceCents,
        ...(c.category ? {} : { category: p.category }),
        images,
        ...(c.description ? {} : { description: p.description ?? '' }),
        ...(!c.active && autoActivate && priceCents > 0 && !c.updatedAt ? { active: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated += 1;
    } else {
      const variants = priceVariants(p.variants);
      const priceCents = basePrice(variants, p.priceCents);
      const images = await mirrorImages(p.images, p.providerProductId);
      // Deterministic id + create(): if two imports race on the same new
      // product, the second create fails instead of adding a duplicate.
      const newRef = db.collection('products').doc(`${provider.id}-${p.providerProductId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120));
      const createdOk = await newRef.create({
        slug: await uniqueSlug(db, p.name), name: p.name, description: p.description ?? '', images, category: p.category,
        priceCents, currency,
        provider: provider.id, providerProductId: p.providerProductId, variants,
        earnedOnly: false, unlockedBy: [], active: autoActivate && priceCents > 0, sortOrder: 100,
        createdAt: FieldValue.serverTimestamp(),
      }).then(() => true, () => false);
      if (!createdOk) continue;
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
    priceCents: p.priceCents, currency: p.currency, earnedOnly: !!p.earnedOnly, unlockedBy: p.unlockedBy ?? [], featured: !!p.featured,
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
