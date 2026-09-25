import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShopShell } from '@/components/shop/ShopShell';
import { ProductDetail } from '@/components/shop/ProductDetail';
import type { PublicProduct } from '@/lib/shop/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

async function load(slug: string): Promise<{ product: PublicProduct | null; challenges: { id: string; title: string }[] }> {
  try {
    const res = await fetch(`${APP_URL}/api/public/shop/products?slug=${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
    if (!res.ok) return { product: null, challenges: [] };
    const { product } = (await res.json()) as { product: PublicProduct | null };
    // Names of the challenges that unlock it, for "Finish X to unlock".
    const challenges = product?.earnedOnly && product.unlockedBy.length
      ? (await Promise.all(product.unlockedBy.slice(0, 5).map(async (id) => {
          const r = await fetch(`${APP_URL}/api/public/challenge?id=${encodeURIComponent(id)}`, { next: { revalidate: 300 } }).catch(() => null);
          const d = r && r.ok ? ((await r.json()) as { challenge?: { id: string; title: string } | null }).challenge : null;
          return d ? { id: d.id, title: d.title } : null;
        }))).filter((c): c is { id: string; title: string } => !!c)
      : [];
    return { product, challenges };
  } catch {
    return { product: null, challenges: [] };
  }
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
  const { product, challenges } = await load(slug);
  if (!product) notFound();
  return (
    <ShopShell>
      <ProductDetail product={product} challenges={challenges} />
    </ShopShell>
  );
}
