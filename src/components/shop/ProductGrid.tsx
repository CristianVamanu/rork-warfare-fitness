'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { money } from '@/lib/shop/cart';
import type { PublicProduct } from '@/lib/shop/server';
import { useUnlocks } from './useUnlocks';

/**
 * The grid. A gated product is shown, not hidden: the lock is the pitch.
 * "Earned, not given" on the card; the product page says which challenge.
 */
export function ProductGrid({ products }: { products: PublicProduct[] }) {
  const { unlocked } = useUnlocks();
  if (products.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        <p className="text-lg font-bold">Nothing on the shelf yet</p>
        <p className="text-sm text-white/60 mt-1">The first drop is coming.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {products.map((p, i) => {
        const locked = p.earnedOnly && !unlocked.has(p.id);
        const from = Math.min(...(p.variants.length ? p.variants.map((v) => v.priceCents) : [p.priceCents]));
        return (
          <Link key={p.id} href={`/shop/${p.slug}`} className="group wf-rise" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="rounded-2xl overflow-hidden border border-white/10 transition-all group-hover:border-accent/40 group-hover:shadow-glow-sm" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
              <div className="relative aspect-square bg-black/40">
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0]} alt={p.name} loading="lazy" className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${locked ? 'saturate-[.35] contrast-[1.1]' : ''}`} />
                ) : (
                  <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--accent-rgb) / 0.25), rgba(0,0,0,0.6) 100%)' }} />
                )}
                {p.earnedOnly && (
                  <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur ${locked ? 'bg-black/70 text-accent border border-accent/40' : 'bg-accent text-black'}`}>
                    <Lock className="w-3 h-3" /> {locked ? 'Earned, not given' : 'Earned'}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-bold leading-snug line-clamp-2">{p.name}</p>
                <p className="text-sm text-white/70 mt-1 tabular-nums">{p.variants.length > 1 && from !== p.priceCents ? 'from ' : ''}{money(from, p.currency)}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
