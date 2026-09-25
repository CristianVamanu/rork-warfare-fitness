import type { Metadata } from 'next';
import { ShopShell } from '@/components/shop/ShopShell';
import { Storefront } from '@/components/shop/Storefront';
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
  const { products, enabled, tagline, shippingCents, currency } = await loadShopListing();
  return (
    <ShopShell>
      {!enabled && products.length === 0 ? (
        <div className="py-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">Warfare Fitness · Supply</p>
          <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mt-2">Earned,<br /><span className="text-accent">not given.</span></h1>
          <div className="mt-8 rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
            <p className="text-lg font-bold">The store opens soon</p>
            <p className="text-sm text-white/60 mt-1">Follow along in the app. The first drop will be announced there.</p>
          </div>
        </div>
      ) : (
        <Storefront products={products} tagline={tagline} shippingCents={shippingCents} currency={currency} />
      )}
    </ShopShell>
  );
}
