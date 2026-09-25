import type { Metadata } from 'next';
import { ShopShell } from '@/components/shop/ShopShell';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { loadShopListing } from '@/lib/shop/public';

export const metadata: Metadata = {
  title: 'Shop — Warfare Fitness',
  description: 'Gear for the ones who put the work in. Some of it you can buy. Some of it you have to earn.',
  alternates: { canonical: '/shop' },
};

export const revalidate = 60;

/**
 * The storefront. Public: anyone can browse and buy the open items; the
 * gated ones are on the shelf too, with the lock, because the lock is the
 * marketing — "earned, not given" is the whole point of the store.
 */
export default async function ShopPage() {
  const { products, enabled, tagline } = await loadShopListing();
  const earned = products.filter((p) => p.earnedOnly);
  const open = products.filter((p) => !p.earnedOnly);
  return (
    <ShopShell>
      <header className="pt-6 pb-8 md:pt-10 md:pb-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">Warfare Fitness · Supply</p>
        <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mt-2">
          Earned,<br /><span className="text-accent">not given.</span>
        </h1>
        <p className="text-base md:text-lg text-white/70 mt-4 max-w-xl leading-relaxed">
          {tagline || 'Gear for the ones who put the work in. Some of it you can buy. Some of it you have to prove yourself for first.'}
        </p>
      </header>

      {!enabled && products.length === 0 ? (
        <div className="rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
          <p className="text-lg font-bold">The store opens soon</p>
          <p className="text-sm text-white/60 mt-1">Follow along in the app. The first drop will be announced there.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {earned.length > 0 && (
            <section>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h2 className="text-xl md:text-2xl font-black">The earned rack</h2>
                  <p className="text-sm text-white/60 mt-0.5">Locked until a verified challenge finish says otherwise.</p>
                </div>
              </div>
              <ProductGrid products={earned} />
            </section>
          )}
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black">{earned.length > 0 ? 'Open supply' : 'Supply'}</h2>
                <p className="text-sm text-white/60 mt-0.5">No gate. Printed and shipped on order.</p>
              </div>
            </div>
            <ProductGrid products={open} />
          </section>
        </div>
      )}
    </ShopShell>
  );
}
