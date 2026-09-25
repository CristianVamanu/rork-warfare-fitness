'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getIdToken, type User } from 'firebase/auth';
import { collection, doc, getDocs, orderBy, query, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { RefreshCw, Download, Lock, ExternalLink, RotateCcw, Check, X, Plug } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, setSystemConfig } from '@/lib/firestore';
import { getChallenges } from '@/lib/challenges';
import { money } from '@/lib/shop/cart';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { STATUS_LABEL, StatusPill } from '@/components/shop/OrderStatus';
import type { Challenge, ShopConfig, ShopOrder, ShopOrderStatus, ShopProduct, ShopProvider } from '@/types';

type Sub = 'settings' | 'products' | 'orders';

const inputCls = 'w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50';
const label = 'text-xs text-text-secondary mb-1.5 block';

/**
 * Admin → Store. Three parts:
 *   Settings — which provider, its shop/store id, currency, shipping, the
 *              webhook URLs to paste into the provider, a Test button.
 *              API keys are entered under Integrations (encrypted store).
 *   Products — Import from the provider, then per product: on the shelf or
 *              not, price, "earned, not given" and which challenges unlock
 *              it, and for Gelato the print file per variant.
 *   Orders   — every paid order, its provider status, Retry for the ones
 *              that failed to hand off, Sync now.
 */
export function StorePanel() {
  const [sub, setSub] = useState<Sub>('settings');
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(['settings', 'products', 'orders'] as Sub[]).map((s) => (
          <button key={s} onClick={() => setSub(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${sub === s ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{s}</button>
        ))}
      </div>
      {sub === 'settings' && <Settings />}
      {sub === 'products' && <Products />}
      {sub === 'orders' && <Orders />}
    </div>
  );
}

async function adminShop<T>(user: User | null, body: Record<string, unknown>): Promise<T> {
  if (!user) throw new Error('Not signed in');
  const token = await getIdToken(user);
  const res = await fetch('/api/admin/shop', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

function Settings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<ShopConfig | null>(null);
  // Latest config for save(): the blur that commits a focused field runs
  // inside save() itself, so the closure's `cfg` is one step behind.
  const cfgRef = useRef<ShopConfig | null>(null);
  cfgRef.current = cfg;
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => { getSystemConfig().then((c) => setCfg(c?.shop ?? {})).catch(() => setCfg({})); }, []);
  const set = <K extends keyof ShopConfig>(k: K, v: ShopConfig[K]) => setCfg((c) => ({ ...(c ?? {}), [k]: v }));

  const save = async () => {
    if (!cfg) return;
    // Fields commit on blur; a tap straight on Save must not lose the one
    // still focused.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
    const latest = cfgRef.current ?? cfg;
    setSaving(true);
    try {
      await setSystemConfig({ shop: { ...latest, currency: (latest.currency || 'USD').toUpperCase(), shipTo: (latest.shipTo ?? []).map((c) => c.toUpperCase()).filter(Boolean) } });
      toast.success('Store settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      await save();
      const r = await adminShop<{ ok: boolean; detail: string }>(user, { action: 'test' });
      setTestResult(r.detail);
      toast.success('Connected');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Failed');
      toast.error('Connection failed');
    } finally { setTesting(false); }
  };

  if (!cfg) return <Skeleton className="h-64 rounded-2xl" />;
  const provider = cfg.provider;

  return (
    <div className="space-y-4">
      <Card className="p-4 lg:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Store open</p>
            <p className="text-xs text-text-secondary">Off = /shop shows &quot;opens soon&quot; and checkout refuses.</p>
          </div>
          <button onClick={() => set('enabled', cfg.enabled === false)} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-3 ${cfg.enabled !== false ? 'bg-accent' : 'bg-surface-elevated'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cfg.enabled !== false ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        <div>
          <label className={label}>Print provider</label>
          <div className="flex gap-2">
            {(['printify', 'gelato'] as ShopProvider[]).map((p) => (
              <button key={p} onClick={() => set('provider', p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${provider === p ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{p}</button>
            ))}
          </div>
          <p className="text-[11px] text-text-tertiary mt-1.5">Keys go under <b>Integrations → Print-on-demand</b>. Products are imported from the selected provider; orders are placed with it.</p>
        </div>
        {provider === 'printify' && (
          <div>
            <label className={label}>Printify shop id</label>
            <input value={cfg.printifyShopId ?? ''} onChange={(e) => set('printifyShopId', e.target.value.trim())} placeholder="e.g. 12345678 — Test shows your shops" className={inputCls} />
          </div>
        )}
        {provider === 'gelato' && (
          <div>
            <label className={label}>Gelato store id</label>
            <input value={cfg.gelatoStoreId ?? ''} onChange={(e) => set('gelatoStoreId', e.target.value.trim())} placeholder="Test shows your stores" className={inputCls} />
            <p className="text-[11px] text-text-tertiary mt-1">Orders reference your Gelato store product, so the design comes from Gelato. Keep the webhook registered (below) and publishing in Gelato updates the shop by itself.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Currency</label><input defaultValue={cfg.currency ?? 'USD'} onBlur={(e) => set('currency', e.target.value.trim().toUpperCase().slice(0, 3) || 'USD')} maxLength={3} className={inputCls} /></div>
          <div><label className={label}>Flat shipping ({cfg.currency || 'USD'}, 0 = free)</label><input type="number" min={0} step="0.01" inputMode="decimal" defaultValue={((cfg.shippingCents ?? 0) / 100).toFixed(2)} onBlur={(e) => set('shippingCents', Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))} className={inputCls} /></div>
        </div>
        <div>
          <label className={label}>Ship to (ISO country codes, comma-separated; empty = the default list)</label>
          <input defaultValue={(cfg.shipTo ?? []).join(', ')} onBlur={(e) => set('shipTo', e.target.value.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))} placeholder="US, GB, DE, RO" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Markup over provider cost (%)</label>
            <input type="number" min={0} step={5} inputMode="numeric" defaultValue={cfg.markupPercent ?? 100} onBlur={(e) => set('markupPercent', Math.max(0, Math.round(Number(e.target.value) || 0)))} className={inputCls} />
            <p className="text-[11px] text-text-tertiary mt-1">100 = sell at twice what Gelato charges you, rounded to .99. Applied on every import. A price you type on a product overrides it for that product (type 0 to go back to automatic).</p>
          </div>
          <div>
            <label className={label}>Cost country</label>
            <input defaultValue={cfg.pricingCountry ?? ''} onBlur={(e) => set('pricingCountry', e.target.value.trim().toUpperCase().slice(0, 2))} placeholder={cfg.shipTo?.[0] ?? 'US'} maxLength={2} className={inputCls} />
            <p className="text-[11px] text-text-tertiary mt-1">Gelato&apos;s cost differs by country; this one sets the shelf price.</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">New products go straight on the shelf</p>
            <p className="text-xs text-text-secondary">Publish in {provider === 'gelato' ? 'Gelato' : 'Printify'} → it appears in /shop, priced. Off = imports wait for you.</p>
          </div>
          <button onClick={() => set('autoActivate', cfg.autoActivate === false)} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-3 ${cfg.autoActivate !== false ? 'bg-accent' : 'bg-surface-elevated'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cfg.autoActivate !== false ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        <div>
          <label className={label}>Tagline on /shop (optional)</label>
          <input value={cfg.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} placeholder="Gear for the ones who put the work in." className={inputCls} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={save} loading={saving}>Save</Button>
          <Button variant="secondary" onClick={test} loading={testing} disabled={!provider}><Plug className="w-4 h-4" /> Test connection</Button>
        </div>
        {testResult && <p className="text-xs text-text-secondary whitespace-pre-wrap">{testResult}</p>}
        <div className="pt-2 border-t border-white/8">
          <button onClick={async () => { setRaw('…'); try { const r = await adminShop<{ raw: unknown }>(user, { action: 'raw' }); setRaw(JSON.stringify(r.raw, null, 2)); } catch (err) { setRaw(err instanceof Error ? err.message : 'Failed'); } }} className="text-xs text-accent font-semibold">
            Show what the provider sends for one product (raw)
          </button>
          {raw && <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] leading-snug text-text-secondary whitespace-pre-wrap break-all">{raw}</pre>}
        </div>
      </Card>

      <Card className="p-4 lg:p-5 space-y-2">
        <p className="text-sm font-bold text-white">Webhooks (order status auto-update)</p>
        <p className="text-xs text-text-secondary">Register these with the provider so shipped/delivered lands in the app the moment it happens. An hourly poll covers anything missed.</p>
        <div className="text-xs space-y-2 mt-2">
          <div>
            <p className="font-semibold text-white">Printify</p>
            <code className="block bg-black/40 rounded-lg px-2 py-1.5 mt-1 break-all">{appUrl}/api/shop/webhooks/printify</code>
            <p className="text-text-tertiary mt-1">Events: order:updated, order:shipment:created. Set a secret on the webhook and store it as PRINTIFY_WEBHOOK_SECRET.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Gelato</p>
            <code className="block bg-black/40 rounded-lg px-2 py-1.5 mt-1 break-all">{appUrl}/api/shop/webhooks/gelato</code>
            <p className="text-text-tertiary mt-1">Tick every event: order_status_updated, order_item_tracking_code_updated, order_item_status_updated, store_product_created, store_product_updated, store_product_deleted. Add header <code>X-Webhook-Secret</code> with the value stored as GELATO_WEBHOOK_SECRET.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Products() {
  const { user } = useAuth();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ShopProduct));
  }, []);
  useEffect(() => { load().catch(() => toast.error('Failed to load products')); getChallenges().then(setChallenges).catch(() => {}); }, [load]);

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await adminShop<{ found?: number; created?: number; updated?: number; queued?: boolean }>(user, { action: 'import' });
      if (r.queued) toast.success('An import is already running — it will pick up your changes when it finishes.');
      else toast.success(`${r.found} found · ${r.created} new · ${r.updated} refreshed.`);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Import failed', { duration: 8000 }); }
    finally { setImporting(false); }
  };

  const patch = async (p: ShopProduct, data: Partial<ShopProduct>) => {
    setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, ...data } : x)) ?? null);
    try { await updateDoc(doc(db, 'products', p.id), { ...data, updatedAt: serverTimestamp() }); }
    catch { toast.error('Failed to save'); await load(); }
  };
  const remove = async (p: ShopProduct) => {
    if (!confirm(`Remove "${p.name}" from the store? Import brings it back.`)) return;
    try { await deleteDoc(doc(db, 'products', p.id)); await load(); } catch { toast.error('Failed to delete'); }
  };

  if (!items) return <Skeleton className="h-40 rounded-2xl" />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary">{items.length} product{items.length === 1 ? '' : 's'} · {items.filter((p) => p.active).length} on the shelf</p>
        <Button size="sm" onClick={doImport} loading={importing}><Download className="w-4 h-4" /> Import from provider</Button>
      </div>
      {items.length === 0 && (
        <Card className="p-8 text-center"><p className="text-white font-bold">No products yet</p><p className="text-text-secondary text-sm mt-1">Design them in Printify or Gelato, then Import. Set the price and put them on the shelf here.</p></Card>
      )}
      {items.map((p) => {
        const isOpen = open === p.id;
        return (
          <Card key={p.id} className="p-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-white truncate">{p.name}</p>
                  {p.earnedOnly && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent"><Lock className="w-3 h-3" /> earned</span>}
                  {p.featured && <span className="text-[10px] font-bold uppercase tracking-wider text-accent">★ featured</span>}
                  {!p.active && <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">off shelf</span>}
                </div>
                <p className="text-xs text-text-tertiary">{p.provider} · {p.variants?.length ?? 0} option{p.variants?.length === 1 ? '' : 's'} · {p.priceCents > 0 ? money(p.priceCents, p.currency) : <span className="text-amber-300">no price</span>}</p>
              </div>
              <button onClick={() => patch(p, { active: !p.active })} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${p.active ? 'bg-accent' : 'bg-surface-elevated'}`} aria-label="On the shelf">
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${p.active ? 'left-6' : 'left-1'}`} />
              </button>
              <button onClick={() => setOpen(isOpen ? null : p.id)} className="text-xs text-accent font-semibold flex-shrink-0">{isOpen ? 'Close' : 'Edit'}</button>
            </div>
            {isOpen && (
              <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Section</label>
                    <input list="wf-shop-sections" defaultValue={p.category ?? 'Gear'} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (p.category ?? '')) patch(p, { category: v }); }} className={inputCls} />
                    <datalist id="wf-shop-sections">{['Apparel', 'Drinkware', 'Wall art', 'Bags', 'Accessories', 'Gear'].map((c) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div><label className={label}>Sort order (lower first)</label><input type="number" defaultValue={p.sortOrder ?? 100} onBlur={(e) => { const v = Math.round(Number(e.target.value) || 100); if (v !== (p.sortOrder ?? 100)) patch(p, { sortOrder: v }); }} className={inputCls} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Name</label><input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && patch(p, { name: e.target.value.trim() })} className={inputCls} /></div>
                  <div><label className={label}>Price ({p.currency}) — e.g. 29.99</label><input type="number" min={0} step="0.01" defaultValue={(p.priceCents / 100).toFixed(2)} onBlur={(e) => { const v = Math.max(0, Math.round((Number(e.target.value) || 0) * 100)); if (v !== p.priceCents) patch(p, v > 0 ? { priceCents: v, priceCustom: true } : { priceCents: 0, priceCustom: false }); }} className={inputCls} /></div>
                </div>
                <div>
                  <label className={label}>Image URLs — one per line, first is the cover</label>
                  <textarea defaultValue={(p.images ?? []).join('\n')} rows={3} placeholder={'https://…/front.png\nhttps://…/back.png'}
                    onBlur={(e) => { const images = e.target.value.split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)); if (images.join('|') !== (p.images ?? []).join('|')) patch(p, { images, imagesCustom: images.length > 0 }); }}
                    className={`${inputCls} resize-none font-mono text-xs`} />
                  {p.images?.length ? (
                    <div className="flex gap-1.5 mt-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.images.map((src, i) => <img key={src + i} src={src} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-black/40" />)}
                    </div>
                  ) : <p className="text-[11px] text-amber-300 mt-1">No image — the shop shows a placeholder. Paste the mockup URL from Gelato (right-click the preview → copy image address).</p>}
                </div>
                <div><label className={label}>Description</label><textarea defaultValue={p.description ?? ''} rows={3} onBlur={(e) => e.target.value !== (p.description ?? '') && patch(p, { description: e.target.value })} className={`${inputCls} resize-none`} /></div>
                <div>
                  <label className={label}>Slug (/shop/…)</label>
                  <input defaultValue={p.slug} onBlur={(e) => {
                    const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
                    if (!v || v === p.slug) return;
                    if ((items ?? []).some((x) => x.id !== p.id && x.slug === v)) { toast.error('Another product already uses that slug'); e.target.value = p.slug; return; }
                    patch(p, { slug: v });
                  }} className={inputCls} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Featured in the shop hero</p>
                    <p className="text-xs text-text-secondary">One product at a time. Switching it on here switches it off elsewhere.</p>
                  </div>
                  <button onClick={async () => {
                    const on = !p.featured;
                    setItems((list) => list?.map((x) => ({ ...x, featured: x.id === p.id ? on : false })) ?? null);
                    try {
                      await Promise.all((items ?? []).filter((x) => x.featured && x.id !== p.id).map((x) => updateDoc(doc(db, 'products', x.id), { featured: false, updatedAt: serverTimestamp() })));
                      await updateDoc(doc(db, 'products', p.id), { featured: on, updatedAt: serverTimestamp() });
                    } catch { toast.error('Failed to save'); await load(); }
                  }} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${p.featured ? 'bg-accent' : 'bg-surface-elevated'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${p.featured ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-accent" /> Earned, not given</p>
                    <p className="text-xs text-text-secondary">Buying needs a verified finish in one of the challenges below (none ticked = any challenge).</p>
                  </div>
                  <button onClick={() => patch(p, { earnedOnly: !p.earnedOnly })} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${p.earnedOnly ? 'bg-accent' : 'bg-surface-elevated'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${p.earnedOnly ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {p.earnedOnly && (
                  <div className="flex flex-wrap gap-1.5">
                    {challenges.length === 0 && <p className="text-xs text-text-tertiary">No challenges yet — create one under Community → Challenges.</p>}
                    {challenges.map((c) => {
                      const on = (p.unlockedBy ?? []).includes(c.id);
                      return (
                        <button key={c.id} onClick={() => patch(p, { unlockedBy: on ? (p.unlockedBy ?? []).filter((x) => x !== c.id) : [...(p.unlockedBy ?? []), c.id] })}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${on ? 'bg-accent text-black border-accent' : 'border-white/15 text-text-secondary'}`}>
                          {on ? <Check className="w-3 h-3 inline mr-1" /> : null}{c.title}{c.status !== 'live' ? ` (${c.status})` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <label className={label}>Options{p.provider === 'gelato' ? ' — cost is what Gelato charges you; a print file is only needed for a variant with no store id' : ''}</label>
                  <div className="space-y-1.5">
                    {(p.variants ?? []).map((v) => (
                      <div key={v.id} className="flex items-center gap-2 text-xs">
                        <span className={`flex-1 min-w-0 truncate ${v.available === false ? 'line-through text-text-tertiary' : 'text-white'}`}>{v.label}</span>
                        <span className="text-text-tertiary tabular-nums">{v.priceCents !== undefined ? money(v.priceCents, p.currency) : '—'}{typeof v.costCents === 'number' ? <span className="text-text-tertiary/60"> · cost {money(v.costCents, p.currency)}</span> : null}</span>
                        {p.provider === 'gelato' && !v.providerStoreVariantId && (
                          <input defaultValue={v.printFileUrl ?? ''} placeholder="https://…/print.png" onBlur={(e) => {
                            const url = e.target.value.trim();
                            if (url === (v.printFileUrl ?? '')) return;
                            patch(p, { variants: p.variants.map((x) => (x.id === v.id ? { ...x, ...(url ? { printFileUrl: url } : { printFileUrl: undefined }) } : x)).map((x) => Object.fromEntries(Object.entries(x).filter(([, val]) => val !== undefined)) as typeof x) });
                          }} className="w-48 bg-surface border border-white/10 rounded-lg px-2 py-1 text-xs text-white" />
                        )}
                        <button onClick={() => patch(p, { variants: p.variants.map((x) => (x.id === v.id ? { ...x, available: x.available === false } : x)) })} className="text-text-tertiary hover:text-white" aria-label="Toggle availability">{v.available === false ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <a href={`/shop/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent font-semibold"><ExternalLink className="w-3.5 h-3.5" /> View in shop</a>
                  <button onClick={() => remove(p)} className="ml-auto text-xs text-danger">Remove</button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

type AdminOrder = Omit<ShopOrder, 'createdAt' | 'updatedAt' | 'paidAt' | 'shippedAt'> & { createdAt: string | null; updatedAt: string | null; paidAt: string | null; shippedAt: string | null };

function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    try { setOrders((await adminShop<{ orders: AdminOrder[] }>(user, { action: 'orders' })).orders); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load orders'); setOrders([]); }
  }, [user]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const shown = useMemo(() => (orders ?? []).filter((o) => filter === 'all' || !['delivered', 'cancelled'].includes(o.status)), [orders, filter]);

  const act = async (id: string, body: Record<string, unknown>, msg: string) => {
    setBusy(id);
    try { const r = await adminShop<{ ok?: boolean; error?: string | null; changed?: number }>(user, body); if (r.error) toast.error(r.error, { duration: 8000 }); else toast.success(msg + (typeof r.changed === 'number' ? ` — ${r.changed} updated` : '')); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed', { duration: 8000 }); }
    finally { setBusy(null); }
  };

  if (!orders) return <Skeleton className="h-40 rounded-2xl" />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {(['open', 'all'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${filter === f ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{f}</button>)}
        </div>
        <Button size="sm" variant="secondary" onClick={() => act('sync', { action: 'sync' }, 'Synced with the provider')} loading={busy === 'sync'}><RefreshCw className="w-4 h-4" /> Sync now</Button>
      </div>
      {shown.length === 0 && <Card className="p-8 text-center text-sm text-text-secondary">Nothing here.</Card>}
      {shown.map((o) => (
        <Card key={o.id} className={`p-3 ${o.status === 'failed' ? 'border-amber-400/40' : ''}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white">#{o.id.slice(0, 8).toUpperCase()}</p>
                <StatusPill status={o.status} />
                {o.providerStatus && <span className="text-[10px] text-text-tertiary">{o.provider}: {o.providerStatus}</span>}
              </div>
              <p className="text-xs text-text-secondary mt-1">{o.items.map((i) => `${i.quantity}× ${i.name} (${i.variantLabel})`).join(', ')}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{o.email}{o.shipping ? ` · ${o.shipping.name}, ${o.shipping.city}, ${o.shipping.country}` : ''} · {money(o.totalCents, o.currency)} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</p>
              {o.tracking?.url && <a href={o.tracking.url} target="_blank" rel="noreferrer" className="text-xs text-accent font-semibold">Tracking {o.tracking.number ?? ''} →</a>}
              {o.error && <p className="text-xs text-amber-300 mt-1">{o.error}</p>}
            </div>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap items-center">
            {o.status === 'failed' && <Button size="sm" onClick={() => act(o.id, { action: 'retry', orderId: o.id }, 'Sent to the provider')} loading={busy === o.id}><RotateCcw className="w-3.5 h-3.5" /> Retry</Button>}
            <select value={o.status} onChange={(e) => act(o.id, { action: 'set-status', orderId: o.id, status: e.target.value }, 'Status set')} className="bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white">
              {(Object.keys(STATUS_LABEL) as ShopOrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
            </select>
            <a href={`/shop/orders/${o.id}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-text-tertiary hover:text-white inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Member view</a>
          </div>
        </Card>
      ))}
    </div>
  );
}
