'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Lock, ShoppingBag, Check, Flame, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { addToCart, money } from '@/lib/shop/cart';
import type { PublicProduct } from '@/lib/shop/server';
import { useUnlocks } from './useUnlocks';

export function ProductDetail({ product, challenges }: { product: PublicProduct; challenges: { id: string; title: string }[] }) {
  const { unlocked, signedIn, ready } = useUnlocks();
  const [image, setImage] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const locked = product.earnedOnly && !unlocked.has(product.id);
  const price = variant?.priceCents ?? product.priceCents;

  const add = () => {
    if (!variant) return;
    addToCart({ productId: product.id, slug: product.slug, name: product.name, variantId: variant.id, variantLabel: variant.label, priceCents: price, currency: product.currency, image: product.images[0], earnedOnly: product.earnedOnly });
    setAdded(true);
    toast.success('Added to your cart');
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div>
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-4"><ChevronLeft className="w-4 h-4" /> Shop</Link>
      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square rounded-3xl overflow-hidden border border-white/10 bg-black/40">
            {product.images[image] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.images[image]} alt={product.name} className={`absolute inset-0 w-full h-full object-cover ${locked ? 'saturate-[.4]' : ''}`} />
            ) : (
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--accent-rgb) / 0.25), rgba(0,0,0,0.6) 100%)' }} />
            )}
            {product.earnedOnly && (
              <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider backdrop-blur ${locked ? 'bg-black/70 text-accent border border-accent/40' : 'bg-accent text-black'}`}>
                {locked ? <Lock className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />} {locked ? 'Earned, not given' : 'You earned this'}
              </span>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {product.images.map((src, i) => (
                <button key={src + i} onClick={() => setImage(i)} className={`w-16 h-16 rounded-xl overflow-hidden border flex-shrink-0 ${i === image ? 'border-accent' : 'border-white/10'}`} aria-label={`Image ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div>
            <h1 className="text-3xl md:text-4xl font-black leading-tight">{product.name}</h1>
            <p className="text-2xl font-black text-accent mt-2 tabular-nums">{money(price, product.currency)}</p>
          </div>
          {product.description && <p className="text-sm md:text-base text-white/75 leading-relaxed whitespace-pre-wrap">{product.description}</p>}

          {product.variants.length > 1 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Option</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button key={v.id} onClick={() => setVariantId(v.id)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${v.id === variantId ? 'bg-accent text-black border-accent' : 'border-white/15 text-white/80 hover:border-white/40'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.earnedOnly && locked ? (
            <div className="rounded-2xl border border-accent/40 p-4 space-y-3" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.16), rgba(var(--accent-rgb) / 0.03))' }}>
              <div className="flex items-center gap-2 text-accent font-black uppercase tracking-wider text-sm"><Lock className="w-4 h-4" /> Earned, not given</div>
              <p className="text-sm text-white/80 leading-relaxed">
                {challenges.length > 0
                  ? <>Finish {challenges.map((c, i) => <span key={c.id}>{i > 0 && (i === challenges.length - 1 ? ' or ' : ', ')}<b className="text-white">{c.title}</b></span>)} with a verified result and this unlocks for you.</>
                  : <>Finish any challenge with a verified result and this unlocks for you.</>}
              </p>
              {!ready ? null : signedIn ? (
                <Link href={challenges[0] ? `/community/challenges/${challenges[0].id}` : '/community/challenges'} className="inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-accent text-black font-bold px-5 py-3.5">
                  <Flame className="w-4 h-4" /> Go earn it
                </Link>
              ) : (
                <div className="space-y-2">
                  <Link href={`/login?next=${encodeURIComponent(`/shop/${product.slug}`)}`} className="inline-flex items-center justify-center gap-2 w-full rounded-2xl bg-accent text-black font-bold px-5 py-3.5">
                    Log in to check your status
                  </Link>
                  <p className="text-center text-xs text-white/50">Not a member? <Link href={`/onboarding?next=${encodeURIComponent(`/shop/${product.slug}`)}`} className="text-accent font-semibold">Join and take on a challenge</Link></p>
                </div>
              )}
            </div>
          ) : (
            <button onClick={add} disabled={!variant} className={`inline-flex items-center justify-center gap-2 w-full rounded-2xl font-bold px-5 py-4 text-base transition-all ${added ? 'bg-emerald-400 text-black' : 'bg-accent text-black shadow-glow-sm'}`}>
              {added ? <><Check className="w-5 h-5" /> In your cart</> : <><ShoppingBag className="w-5 h-5" /> Add to cart</>}
            </button>
          )}

          <ul className="text-xs text-white/50 space-y-1">
            <li>Printed and shipped to order. Allow 2–7 business days for production.</li>
            <li>Every purchase gets tracking and an email when it ships.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
