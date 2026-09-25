import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShopShell } from '@/components/shop/ShopShell';
import { ProductDetail } from '@/components/shop/ProductDetail';
import type { PublicProduct } from '@/lib/shop/server';
import { loadShopProduct } from '@/lib/shop/public';
import { getPublicBranding } from '@/lib/publicBranding';
import { loadPublicChallenge } from '@/lib/challengesPublic';

export const dynamic = 'force-dynamic';

async function load(slug: string): Promise<{ product: PublicProduct | null; challenges: { id: string; title: string }[] }> {
  const product = await loadShopProduct(slug);
  // Names of the challenges that unlock it, for "Finish X to unlock".
  const challenges = product?.earnedOnly && product.unlockedBy.length
    ? (await Promise.all(product.unlockedBy.slice(0, 5).map((id) => loadPublicChallenge(id))))
        .filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ id: c.id, title: c.title }))
    : [];
  return { product, challenges };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await load(slug);
  if (!product) return { title: 'Not found' };
  const title = `${product.name} — Warfare Fitness Shop`;
  return {
    title, description: product.description?.slice(0, 160) || 'Warfare Fitness gear.',
    alternates: { canonical: `/shop/${slug}` },
    openGraph: { title, description: product.description?.slice(0, 160), ...(product.images[0] ? { images: [{ url: product.images[0] }] } : {}) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ product, challenges }, brand] = await Promise.all([load(slug), getPublicBranding()]);
  // A closed store has no product pages either — shared links and search
  // results land on 404 rather than on a Buy button that checkout refuses.
  if (!product || !brand.shopOpen) notFound();
  return (
    <ShopShell>
      <ProductDetail product={product} challenges={challenges} />
    </ShopShell>
  );
}
