'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => { getSystemConfig().then((c) => setCfg(c?.shop ?? {})).catch(() => setCfg({})); }, []);
  const set = <K extends keyof ShopConfig>(k: K, v: ShopConfig[K]) => setCfg((c) => ({ ...(c ?? {}), [k]: v }));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      await setSystemConfig({ shop: { ...cfg, currency: (cfg.currency || 'USD').toUpperCase(), shipTo: (cfg.shipTo ?? []).map((c) => c.toUpperCase()).filter(Boolean) } });
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
          <button onClick={() => set('enabled', cfg.enabled === false)} className={`w-11 h-6 rounded-full transition-colors relative ${cfg.enabled !== false ? 'bg-accent' : 'bg-surface-elevated'}`}>
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
            <p className="text-[11px] text-text-tertiary mt-1">Gelato orders need a <b>print file URL per variant</b> (set in Products after import). Printify does not.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Currency</label><input value={cfg.currency ?? 'USD'} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} className={inputCls} /></div>
          <div><label className={label}>Flat shipping (minor units, 0 = free)</label><input type="number" min={0} value={cfg.shippingCents ?? 0} onChange={(e) => set('shippingCents', Math.max(0, Math.round(Number(e.target.value) || 0)))} className={inputCls} /></div>
        </div>
        <div>
          <label className={label}>Ship to (ISO country codes, comma-separated; empty = the default list)</label>
          <input value={(cfg.shipTo ?? []).join(', ')} onChange={(e) => set('shipTo', e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))} placeholder="US, GB, DE, RO" className={inputCls} />
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
            <p className="text-text-tertiary mt-1">Events: order_status_updated, order_item_tracking_code_updated. Add header <code>X-Webhook-Secret</code> with the value stored as GELATO_WEBHOOK_SECRET.</p>
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
      const r = await adminShop<{ found: number; created: number; updated: number }>(user, { action: 'import' });
      toast.success(`${r.found} found · ${r.created} new · ${r.updated} refreshed. New ones start off the shelf.`);
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
                  <div><label className={label}>Name</label><input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && patch(p, { name: e.target.value.trim() })} className={inputCls} /></div>
                  <div><label className={label}>Price ({p.currency}, minor units)</label><input type="number" min={0} defaultValue={p.priceCents} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== p.priceCents) patch(p, { priceCents: v }); }} className={inputCls} /></div>
                </div>
                <div><label className={label}>Description</label><textarea defaultValue={p.description ?? ''} rows={3} onBlur={(e) => e.target.value !== (p.description ?? '') && patch(p, { description: e.target.value })} className={`${inputCls} resize-none`} /></div>
                <div>
                  <label className={label}>Slug (/shop/…)</label>
                  <input defaultValue={p.slug} onBlur={(e) => { const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''); if (v && v !== p.slug) patch(p, { slug: v }); }} className={inputCls} />
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
                  <label className={label}>Options {p.provider === 'gelato' ? '— print file URL is required for Gelato' : ''}</label>
                  <div className="space-y-1.5">
                    {(p.variants ?? []).map((v) => (
                      <div key={v.id} className="flex items-center gap-2 text-xs">
                        <span className={`flex-1 min-w-0 truncate ${v.available === false ? 'line-through text-text-tertiary' : 'text-white'}`}>{v.label}</span>
                        <span className="text-text-tertiary tabular-nums">{v.priceCents !== undefined ? money(v.priceCents, p.currency) : '—'}</span>
                        {p.provider === 'gelato' && (
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
