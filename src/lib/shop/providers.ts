/**
 * Print-on-demand providers, behind one interface.
 *
 * Server only. Both providers are HTTP APIs with a bearer-style key; the
 * key comes from the encrypted secrets store, never from the client.
 *
 *   Printify  https://developers.printify.com   Bearer token, shop-scoped
 *   Gelato    https://dashboard.gelato.com/docs  X-API-KEY, order + e-commerce APIs
 *
 * Statuses are mapped onto ShopOrderStatus so the order page and the admin
 * list read the same words whichever provider printed the thing.
 */

import { getSecret } from '@/lib/secrets';
import type { ShopOrder, ShopOrderStatus, ShopProvider, ShopVariant } from '@/types';

/** A shelf section from whatever the provider tells us about the item. */
export function guessCategory(...hints: (string | undefined)[]): string {
  const h = hints.filter(Boolean).join(' ').toLowerCase();
  if (/hoodie|sweat|t-shirt|tee|shirt|tank|apparel|jacket|shorts|legging|jogger|cap\b|hat|beanie|sock/.test(h)) return 'Apparel';
  if (/mug|bottle|tumbler|drinkware|glass|flask/.test(h)) return 'Drinkware';
  if (/poster|canvas|frame|wall|print\b|acrylic|metal print/.test(h)) return 'Wall art';
  if (/tote|bag|backpack|duffel|gym bag|pouch/.test(h)) return 'Bags';
  if (/phone|case|sticker|mouse|pad|notebook|journal|towel|patch|keychain/.test(h)) return 'Accessories';
  return 'Gear';
}

export interface ImportedProduct {
  providerProductId: string;
  category: string;
  name: string;
  description?: string;
  images: string[];
  priceCents: number;
  currency: string;
  variants: ShopVariant[];
}

export interface ImportOptions {
  /** ISO country for provider cost lookups (Gelato prices vary by country). */
  country: string;
  currency: string;
}

export interface ProviderOrderState {
  providerStatus: string;
  status: ShopOrderStatus;
  tracking?: { carrier?: string; number?: string; url?: string };
}

export interface PodProvider {
  readonly id: ShopProvider;
  /** Throws with a readable message when the key is missing or rejected. */
  test(): Promise<{ ok: true; detail: string }>;
  /** The provider's own JSON for the first product, untouched — for
   *  checking what fields it actually sends (prices, images). */
  rawFirstProduct(): Promise<unknown>;
  listProducts(opts: ImportOptions): Promise<ImportedProduct[]>;
  createOrder(order: ShopOrder): Promise<{ providerOrderId: string; providerStatus: string }>;
  getOrder(providerOrderId: string): Promise<ProviderOrderState>;
}

class ProviderError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

async function call<T>(url: string, init: RequestInit & { label: string }): Promise<T> {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = j.message || j.error || j.errors?.reason || JSON.stringify(j).slice(0, 300); } catch { /* raw */ }
    throw new ProviderError(`${init.label}: ${res.status} ${msg}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') || parts[0] || '' };
}

// ── Printify ─────────────────────────────────────────────────────────────

const PRINTIFY = 'https://api.printify.com/v1';

const PRINTIFY_STATUS: Record<string, ShopOrderStatus> = {
  'pending': 'submitted',
  'on-hold': 'submitted',
  'sending-to-production': 'submitted',
  'in-production': 'in_production',
  'has-issues': 'failed',
  'canceled': 'cancelled',
  'cancelled': 'cancelled',
  'fulfilled': 'shipped',
  'partially-fulfilled': 'shipped',
  'shipped': 'shipped',
  'delivered': 'delivered',
};

export function printifyStatus(s: string): ShopOrderStatus {
  return PRINTIFY_STATUS[s] ?? 'in_production';
}

class Printify implements PodProvider {
  readonly id = 'printify' as const;
  constructor(private readonly shopId: string) {}

  private async headers() {
    const key = await getSecret('PRINTIFY_API_KEY');
    if (!key) throw new ProviderError('PRINTIFY_API_KEY is not set (Admin → Integrations)');
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  }

  async test() {
    const shops = await call<{ id: number; title: string }[]>(`${PRINTIFY}/shops.json`, { headers: await this.headers(), label: 'Printify shops' });
    if (!this.shopId) return { ok: true as const, detail: `Key works. Shops: ${shops.map((s) => `${s.title} (#${s.id})`).join(', ') || 'none'} — set the shop id in Store settings.` };
    const mine = shops.find((s) => String(s.id) === String(this.shopId));
    if (!mine) throw new ProviderError(`Shop ${this.shopId} not found on this token. Available: ${shops.map((s) => `${s.title} (#${s.id})`).join(', ')}`);
    return { ok: true as const, detail: `Connected to ${mine.title} (#${mine.id})` };
  }

  async rawFirstProduct() {
    const res = await call<{ data: unknown[] }>(`${PRINTIFY}/shops/${this.shopId}/products.json?limit=1&page=1`, { headers: await this.headers(), label: 'Printify products' });
    return res.data?.[0] ?? null;
  }

  async listProducts(_opts: ImportOptions) {
    if (!this.shopId) throw new ProviderError('Set the Printify shop id first');
    type P = { id: string; title: string; description?: string; images?: { src: string; is_default?: boolean }[]; variants?: { id: number; title: string; price: number; is_enabled: boolean; is_available?: boolean }[]; visible?: boolean };
    const out: ImportedProduct[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await call<{ data: P[]; last_page?: number }>(`${PRINTIFY}/shops/${this.shopId}/products.json?limit=50&page=${page}`, { headers: await this.headers(), label: 'Printify products' });
      for (const p of res.data ?? []) {
        const enabled = (p.variants ?? []).filter((v) => v.is_enabled);
        if (enabled.length === 0) continue;
        const images = (p.images ?? []).sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default)).map((i) => i.src);
        out.push({
          providerProductId: String(p.id),
          category: guessCategory(p.title, (p as { tags?: string[] }).tags?.join(' ')),
          name: p.title,
          description: p.description?.replace(/<[^>]+>/g, '').trim() || undefined,
          images,
          priceCents: Math.min(...enabled.map((v) => v.price)),
          currency: 'USD',
          variants: enabled.map((v) => ({
            id: `pf-${v.id}`, label: v.title, providerVariantId: String(v.id), priceCents: v.price, available: v.is_available !== false,
          })),
        });
      }
      if (!res.last_page || page >= res.last_page) break;
    }
    return out;
  }

  async createOrder(order: ShopOrder) {
    if (!order.shipping) throw new ProviderError('Order has no shipping address');
    const { first, last } = splitName(order.shipping.name);
    const body = {
      external_id: order.id,
      label: `WF-${order.id.slice(0, 8)}`,
      line_items: order.items.map((i) => ({ product_id: i.providerProductId, variant_id: Number(i.providerVariantId), quantity: i.quantity })),
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: first, last_name: last, email: order.email, phone: order.shipping.phone ?? '',
        country: order.shipping.country, region: order.shipping.state ?? '', address1: order.shipping.line1, address2: order.shipping.line2 ?? '',
        city: order.shipping.city, zip: order.shipping.postalCode,
      },
    };
    const created = await call<{ id: string }>(`${PRINTIFY}/shops/${this.shopId}/orders.json`, { method: 'POST', headers: await this.headers(), body: JSON.stringify(body), label: 'Printify create order' });
    // Creating leaves the order on hold; production starts on this call.
    await call(`${PRINTIFY}/shops/${this.shopId}/orders/${created.id}/send_to_production.json`, { method: 'POST', headers: await this.headers(), label: 'Printify send to production' });
    return { providerOrderId: created.id, providerStatus: 'sending-to-production' };
  }

  async getOrder(id: string) {
    type O = { status: string; shipments?: { carrier?: string; number?: string; url?: string }[] };
    const o = await call<O>(`${PRINTIFY}/shops/${this.shopId}/orders/${id}.json`, { headers: await this.headers(), label: 'Printify order' });
    const ship = o.shipments?.[0];
    return { providerStatus: o.status, status: printifyStatus(o.status), ...(ship ? { tracking: { carrier: ship.carrier, number: ship.number, url: ship.url } } : {}) };
  }
}

// ── Gelato ───────────────────────────────────────────────────────────────

const GELATO_ORDERS = 'https://order.gelatoapis.com/v4';
const GELATO_STORE = 'https://ecommerce.gelatoapis.com/v1';
const GELATO_PRODUCT = 'https://product.gelatoapis.com/v3';

const GELATO_STATUS: Record<string, ShopOrderStatus> = {
  created: 'submitted', uploading: 'submitted', passed: 'submitted', pending_approval: 'submitted',
  in_production: 'in_production', printed: 'in_production', draft: 'submitted',
  shipped: 'shipped', delivered: 'delivered',
  canceled: 'cancelled', cancelled: 'cancelled', failed: 'failed', not_connected: 'failed',
};

export function gelatoStatus(s: string): ShopOrderStatus {
  return GELATO_STATUS[s] ?? 'in_production';
}

class Gelato implements PodProvider {
  readonly id = 'gelato' as const;
  constructor(private readonly storeId: string) {}

  private async headers() {
    const key = await getSecret('GELATO_API_KEY');
    if (!key) throw new ProviderError('GELATO_API_KEY is not set (Admin → Integrations)');
    return { 'X-API-KEY': key, 'Content-Type': 'application/json' };
  }

  async test() {
    const stores = await call<{ stores?: { id: string; name: string }[] }>(`${GELATO_STORE}/stores`, { headers: await this.headers(), label: 'Gelato stores' });
    const list = stores.stores ?? [];
    if (!this.storeId) return { ok: true as const, detail: `Key works. Stores: ${list.map((s) => `${s.name} (${s.id})`).join(', ') || 'none — create one in the Gelato dashboard'} — set the store id in Store settings.` };
    const mine = list.find((s) => s.id === this.storeId);
    if (!mine) throw new ProviderError(`Store ${this.storeId} not found on this key. Available: ${list.map((s) => `${s.name} (${s.id})`).join(', ')}`);
    return { ok: true as const, detail: `Connected to ${mine.name}` };
  }

  /** What Gelato charges us for one unit of a productUid, in minor units,
   *  or null when it will not say (unsupported country, unknown uid). */
  private async costCents(productUid: string, country: string, currency: string): Promise<number | null> {
    try {
      type Row = { productUid: string; country: string; quantity: number; price: number; currency: string };
      const rows = await call<Row[]>(`${GELATO_PRODUCT}/products/${encodeURIComponent(productUid)}/prices?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}`, { headers: await this.headers(), label: 'Gelato prices' });
      const one = (Array.isArray(rows) ? rows : []).filter((r) => r.currency === currency).sort((a, b) => a.quantity - b.quantity)[0];
      return one && Number.isFinite(one.price) ? Math.round(one.price * 100) : null;
    } catch {
      return null;
    }
  }

  async rawFirstProduct() {
    if (!this.storeId) throw new ProviderError('Set the Gelato store id first');
    const list = await call<{ products?: { id: string }[] }>(`${GELATO_STORE}/stores/${this.storeId}/products?limit=1`, { headers: await this.headers(), label: 'Gelato products' });
    const first = list.products?.[0];
    if (!first) return { list, note: 'store has no products' };
    const product = await call<unknown>(`${GELATO_STORE}/stores/${this.storeId}/products/${first.id}`, { headers: await this.headers(), label: 'Gelato product' });
    return { listEntry: first, product };
  }

  async listProducts(opts: ImportOptions) {
    if (!this.storeId) throw new ProviderError('Set the Gelato store id first');
    type V = { id: string; title: string; productUid: string; variantOptions?: { name: string; value: string }[]; imageUrl?: string; previewUrl?: string; externalPreviewUrl?: string; price?: number; retailPrice?: number };
    type P = { id: string; title: string; description?: string; previewUrl?: string; externalPreviewUrl?: string; externalThumbnailUrl?: string; imageUrl?: string; variants?: V[]; productVariantOptions?: unknown };
    // Paged: the list endpoint caps at 100 and a store grows past that.
    const listed: P[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const res = await call<{ products?: P[] }>(`${GELATO_STORE}/stores/${this.storeId}/products?limit=100&offset=${offset}`, { headers: await this.headers(), label: 'Gelato products' });
      const page = res.products ?? [];
      listed.push(...page);
      if (page.length < 100) break;
    }
    const out: ImportedProduct[] = [];
    for (const p of listed) {
      // The list endpoint is shallow; variants come from the product endpoint.
      const full = await call<P>(`${GELATO_STORE}/stores/${this.storeId}/products/${p.id}`, { headers: await this.headers(), label: 'Gelato product' }).catch(() => p);
      const variants = (full.variants ?? []).filter((v) => v.productUid);
      if (variants.length === 0) continue;
      // Gelato names the preview differently depending on how the product
      // was made (designed in Gelato, pushed from a connected store, or a
      // template), so every field it has ever used is tried, product first.
      // The named fields carry one preview. The gallery (every mockup the
      // product shows in the Gelato dashboard) sits in nested arrays such
      // as productImages[].fileUrl, and the shape has moved between API
      // versions, so the whole payload is walked for image URLs: product
      // level first, then per variant, order preserved, duplicates dropped.
      const images = [
        full.previewUrl, full.externalPreviewUrl, full.externalThumbnailUrl, full.imageUrl,
        ...harvestImageUrls(full, ['variants']),
        p.previewUrl, p.externalPreviewUrl, p.externalThumbnailUrl,
        ...variants.flatMap((v) => [v.imageUrl, v.previewUrl, v.externalPreviewUrl, ...harvestImageUrls(v)]),
      ].filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u));
      // Gelato's store API does not carry the retail price the dashboard
      // shows (that lives in the connected shop, which here is us). What it
      // does carry is the cost per productUid, so each variant gets its
      // cost and the importer prices from the configured markup. A retail
      // price is used if Gelato ever starts sending one.
      const costs = await Promise.all(variants.map((v) => this.costCents(v.productUid, opts.country, opts.currency)));
      out.push({
        providerProductId: String(p.id),
        category: guessCategory(full.title || p.title, variants[0]?.productUid),
        name: full.title || p.title,
        description: full.description?.replace(/<[^>]+>/g, '').trim() || undefined,
        images: Array.from(new Set(images)),
        priceCents: 0,
        currency: opts.currency,
        variants: variants.map((v, i) => {
          const retail = typeof v.retailPrice === 'number' ? v.retailPrice : typeof v.price === 'number' ? v.price : null;
          return {
            id: `gl-${v.id}`,
            label: v.variantOptions?.map((o) => o.value).join(' / ') || v.title,
            providerVariantId: v.productUid,
            providerStoreVariantId: String(v.id),
            available: true,
            ...(retail !== null ? { priceCents: Math.round(retail * 100) } : {}),
            ...(costs[i] !== null ? { costCents: costs[i] as number } : {}),
          };
        }),
      });
    }
    return out;
  }

  async createOrder(order: ShopOrder) {
    if (!order.shipping) throw new ProviderError('Order has no shipping address');
    // An item ordered by its store variant takes its design from the store
    // product in Gelato — nothing to upload, nothing to paste. Only an item
    // with no store variant (a hand-entered productUid) needs a print file.
    const missing = order.items.filter((i) => !i.providerStoreVariantId && !i.printFileUrl);
    if (missing.length) throw new ProviderError(`Gelato needs a print file for: ${missing.map((i) => i.name).join(', ')} (or re-import so the variant carries its store id)`);
    const { first, last } = splitName(order.shipping.name);
    const body = {
      orderType: 'order',
      orderReferenceId: order.id,
      customerReferenceId: order.userId ?? order.email,
      currency: order.currency.toUpperCase(),
      items: order.items.map((i) => ({
        itemReferenceId: `${order.id}-${i.variantId}`,
        quantity: i.quantity,
        ...(i.providerStoreVariantId
          ? { storeProductVariantId: i.providerStoreVariantId, ...(i.printFileUrl ? { files: [{ type: 'default', url: i.printFileUrl }] } : {}) }
          : { productUid: i.providerVariantId, files: [{ type: 'default', url: i.printFileUrl }] }),
      })),
      shipmentMethodUid: 'normal',
      shippingAddress: {
        firstName: first, lastName: last, addressLine1: order.shipping.line1, addressLine2: order.shipping.line2 ?? '',
        city: order.shipping.city, postCode: order.shipping.postalCode, state: order.shipping.state ?? '', country: order.shipping.country,
        email: order.email, phone: order.shipping.phone ?? '',
      },
    };
    const created = await call<{ id: string; fulfillmentStatus?: string }>(`${GELATO_ORDERS}/orders`, { method: 'POST', headers: await this.headers(), body: JSON.stringify(body), label: 'Gelato create order' });
    return { providerOrderId: created.id, providerStatus: created.fulfillmentStatus ?? 'created' };
  }

  async getOrder(id: string) {
    type O = { fulfillmentStatus: string; shipments?: { trackingUrl?: string; trackingCode?: string; carrier?: string; shipmentMethodName?: string }[] };
    const o = await call<O>(`${GELATO_ORDERS}/orders/${id}`, { headers: await this.headers(), label: 'Gelato order' });
    const ship = o.shipments?.[0];
    return {
      providerStatus: o.fulfillmentStatus,
      status: gelatoStatus(o.fulfillmentStatus),
      ...(ship ? { tracking: { carrier: ship.carrier ?? ship.shipmentMethodName, number: ship.trackingCode, url: ship.trackingUrl } } : {}),
    };
  }
}

export function makeProvider(id: ShopProvider, cfg: { printifyShopId?: string; gelatoStoreId?: string }): PodProvider {
  return id === 'gelato' ? new Gelato(cfg.gelatoStoreId ?? '') : new Printify(cfg.printifyShopId ?? '');
}


const IMAGE_KEY = /image|preview|thumbnail|mockup|fileurl|photo/i;
const IMAGE_URL = /^https?:\/\/.+?(\.(png|jpe?g|webp|gif)(\?|$)|\/(image|preview|mockup|thumbnail)s?\/|storage\.googleapis\.com)/i;

/**
 * Every plausible image URL in a provider payload, in document order.
 * A string counts when it sits under an image-ish key or looks like an
 * image file; `skip` names top-level keys to leave alone (variants are
 * walked separately so their pictures come after the product's own).
 * Print files are excluded: those are the artwork, not a mockup.
 */
export function harvestImageUrls(node: unknown, skip: string[] = []): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') {
      if (/^https?:\/\//.test(v) && (IMAGE_KEY.test(key) || IMAGE_URL.test(v)) && !/printfile|print_file|artwork/i.test(key)) out.push(v);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (depth === 0 && skip.includes(k)) continue;
        walk(x, k, depth + 1);
      }
    }
  };
  walk(node, '', 0);
  return Array.from(new Set(out));
}
