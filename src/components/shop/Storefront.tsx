'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X, Lock, ShoppingBag, Check, SlidersHorizontal, Truck, ShieldCheck, Flame, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { addToCart, money } from '@/lib/shop/cart';
import type { PublicProduct } from '@/lib/shop/server';
import { useUnlocks } from './useUnlocks';

type Sort = 'featured' | 'new' | 'price-asc' | 'price-desc';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'new', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

/**
 * The shop, as a shop: search, sections, sort, an "earned" filter, quick
 * add for single-option items, the locked rack shown with its locks. All
 * client-side over the list the server rendered, so filtering is instant
 * and the page still arrives with products in the HTML for search engines.
 */
export function Storefront({ products, tagline, shippingCents, currency }: {
  products: PublicProduct[];
  tagline: string | null;
  shippingCents: number;
  currency: string;
}) {
  const { unlocked, signedIn } = useUnlocks();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<Sort>('featured');
  const [earnedOnly, setEarnedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return ['All', ...Array.from(counts.keys()).sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b))];
  }, [products]);

  const priceOf = (p: PublicProduct) => Math.min(...(p.variants.length ? p.variants.map((v) => v.priceCents) : [p.priceCents]));

  const shown = useMemo(() => {
    let list = products;
    if (category !== 'All') list = list.filter((p) => p.category === category);
    if (earnedOnly) list = list.filter((p) => p.earnedOnly);
    if (q) list = list.filter((p) => `${p.name} ${p.description} ${p.category} ${p.variants.map((v) => v.label).join(' ')}`.toLowerCase().includes(q));
    const arr = [...list];
    if (sort === 'new') arr.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'price-asc') arr.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === 'price-desc') arr.sort((a, b) => priceOf(b) - priceOf(a));
    return arr;
  }, [products, category, earnedOnly, q, sort]);

  const earnedCount = products.filter((p) => p.earnedOnly).length;
  const featured = products.filter((p) => p.earnedOnly).slice(0, 1)[0] ?? products[0];

  return (
    <div className="space-y-6">
      {/* Utility bar: shipping + trust, the things a first-time buyer checks. */}
      <div className="flex items-center gap-4 overflow-x-auto text-xs text-white/70 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Truck className="w-3.5 h-3.5 text-accent" /> {shippingCents > 0 ? `Flat ${money(shippingCents, currency)} shipping` : 'Free shipping'}</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ShieldCheck className="w-3.5 h-3.5 text-accent" /> Printed to order · tracked</span>
        {earnedCount > 0 && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Lock className="w-3.5 h-3.5 text-accent" /> {earnedCount} earned-only item{earnedCount === 1 ? '' : 's'}</span>}
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-10" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.18), rgba(0,0,0,0.6) 55%, rgba(var(--accent-rgb) / 0.06))' }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} aria-hidden="true" />
        <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">Warfare Fitness · Supply</p>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mt-2">Earned,<br /><span className="text-accent">not given.</span></h1>
            <p className="text-sm md:text-base text-white/70 mt-3 max-w-lg leading-relaxed">{tagline || 'Gear for the ones who put the work in. Some of it you can buy. Some of it you have to prove yourself for first.'}</p>
          </div>
          {featured && (
            <Link href={`/shop/${featured.slug}`} className="group min-w-0 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 backdrop-blur p-3 hover:border-accent/50 transition-colors md:w-72">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {featured.images[0] && <img src={featured.images[0]} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent">{featured.earnedOnly ? 'Earned, not given' : 'Featured'}</p>
                <p className="text-sm font-bold truncate">{featured.name}</p>
                <p className="text-xs text-white/60 inline-flex items-center gap-1">{featured.earnedOnly ? 'See what unlocks it' : money(priceOf(featured), featured.currency)} <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></p>
              </div>
            </Link>
          )}
        </div>
      </header>

      {/* Search + controls, sticky under the nav */}
      <div className="sticky top-2 z-30 space-y-2">
        <div className="rounded-2xl border border-white/10 backdrop-blur-xl p-2 flex gap-2" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
          <label className="flex-1 flex items-center gap-2 rounded-xl bg-black/40 px-3">
            <Search className="w-4 h-4 text-white/50 flex-shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search gear…" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-white/40" aria-label="Search products" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X className="w-4 h-4 text-white/50" /></button>}
          </label>
          <button onClick={() => setFiltersOpen((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-semibold border ${filtersOpen || earnedOnly || sort !== 'featured' ? 'border-accent text-accent' : 'border-white/15 text-white/80'}`} aria-expanded={filtersOpen}>
            <SlidersHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
        {filtersOpen && (
          <div className="rounded-2xl border border-white/10 backdrop-blur-xl p-3 flex flex-wrap items-center gap-2" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
            <span className="text-[11px] uppercase tracking-wider text-white/50 mr-1">Sort</span>
            {SORTS.map((s) => (
              <button key={s.id} onClick={() => setSort(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${sort === s.id ? 'bg-accent text-black border-accent' : 'border-white/15 text-white/80'}`}>{s.label}</button>
            ))}
            {earnedCount > 0 && (
              <button onClick={() => setEarnedOnly((v) => !v)} className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${earnedOnly ? 'bg-accent text-black border-accent' : 'border-white/15 text-white/80'}`}>
                <Lock className="w-3.5 h-3.5" /> Earned only
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Sections">
        {categories.map((c) => (
          <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
            className={`whitespace-nowrap px-4 h-9 rounded-full text-sm font-semibold transition-all ${category === c ? 'bg-accent text-black shadow-glow-sm' : 'text-white/80 border border-white/15 hover:border-white/40'}`}>
            {c}{c !== 'All' && <span className="ml-1.5 text-[11px] opacity-60">{products.filter((p) => p.category === c).length}</span>}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-white/60">{shown.length} item{shown.length === 1 ? '' : 's'}{q ? ` for “${query.trim()}”` : ''}{category !== 'All' ? ` in ${category}` : ''}</p>
        {(q || category !== 'All' || earnedOnly) && <button onClick={() => { setQuery(''); setCategory('All'); setEarnedOnly(false); }} className="text-xs text-accent font-semibold">Clear</button>}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
          <p className="text-lg font-bold">Nothing here{q ? ' for that search' : ''}</p>
          <p className="text-sm text-white/60 mt-1">{products.length === 0 ? 'The first drop is coming.' : 'Try another section or clear the filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {shown.map((p, i) => <ProductCard key={p.id} p={p} index={i} locked={p.earnedOnly && !unlocked.has(p.id)} signedIn={signedIn} />)}
        </div>
      )}

      {/* The pitch for the locked rack, once, under the grid. */}
      {earnedCount > 0 && (
        <section className="rounded-3xl border border-accent/30 p-6 md:p-8 grid md:grid-cols-[1fr_auto] gap-4 items-center" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.14), rgba(0,0,0,0.4))' }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-accent inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> The earned rack</p>
            <h2 className="text-2xl md:text-3xl font-black mt-1">Money can&apos;t buy it. A verified result can.</h2>
            <p className="text-sm text-white/70 mt-2 max-w-xl">Finish a challenge in the app, get your result verified, and the lock opens for you. Everyone else keeps looking at it.</p>
          </div>
          <Link href={signedIn ? '/community/challenges' : '/onboarding?next=%2Fcommunity%2Fchallenges'} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent text-black font-bold px-6 py-3.5 shadow-glow-sm whitespace-nowrap">
            <Flame className="w-4 h-4" /> {signedIn ? 'See the challenges' : 'Join and take one on'}
          </Link>
        </section>
      )}
    </div>
  );
}

function ProductCard({ p, index, locked, signedIn }: { p: PublicProduct; index: number; locked: boolean; signedIn: boolean }) {
  const [added, setAdded] = useState(false);
  const from = Math.min(...(p.variants.length ? p.variants.map((v) => v.priceCents) : [p.priceCents]));
  const single = p.variants.length === 1 ? p.variants[0] : null;
  const quickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!single) return;
    addToCart({ productId: p.id, slug: p.slug, name: p.name, variantId: single.id, variantLabel: single.label, priceCents: single.priceCents, currency: p.currency, image: p.images[0], earnedOnly: p.earnedOnly });
    setAdded(true); toast.success('Added to your cart'); setTimeout(() => setAdded(false), 1500);
  };
  return (
    <Link href={`/shop/${p.slug}`} className="group wf-rise" style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}>
      <div className="h-full flex flex-col rounded-2xl overflow-hidden border border-white/10 transition-all group-hover:border-accent/40 group-hover:shadow-glow-sm" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        <div className="relative aspect-square bg-black/40">
          {p.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0]} alt={p.name} loading="lazy" className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${locked ? 'saturate-[.35] contrast-[1.1]' : ''}`} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--accent-rgb) / 0.25), rgba(0,0,0,0.6) 100%)' }}>
              <ShoppingBag className="w-8 h-8 text-white/20" />
            </div>
          )}
          {p.images[1] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[1]} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[10px] font-semibold text-white/80">{p.category}</span>
          {p.earnedOnly && (
            <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur ${locked ? 'bg-black/70 text-accent border border-accent/40' : 'bg-accent text-black'}`}>
              <Lock className="w-3 h-3" /> {locked ? 'Earned, not given' : 'Earned'}
            </span>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col">
          <p className="text-sm font-bold leading-snug line-clamp-2">{p.name}</p>
          <div className="mt-auto pt-2 flex items-center justify-between gap-2">
            <p className="text-sm font-black tabular-nums">{p.variants.length > 1 && from !== p.priceCents ? <span className="text-white/50 font-medium text-xs">from </span> : null}{money(from, p.currency)}</p>
            {locked ? (
              <span className="text-[11px] text-accent font-semibold">{signedIn ? 'Earn it' : 'Log in'}</span>
            ) : single ? (
              <button onClick={quickAdd} aria-label={`Add ${p.name} to cart`} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${added ? 'bg-emerald-400 text-black' : 'bg-accent text-black'}`}>
                {added ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              </button>
            ) : (
              <span className="text-[11px] text-white/60">{p.variants.length} options</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
