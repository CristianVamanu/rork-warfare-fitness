'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getIdToken } from 'firebase/auth';
import { ChevronLeft, Minus, Plus, Trash2, Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCart, setQuantity, removeFromCart, money } from '@/lib/shop/cart';
import { useUnlocks } from './useUnlocks';

export function CartView() {
  const lines = useCart();
  const { user } = useAuth();
  const { unlocked, signedIn, ready } = useUnlocks();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  const subtotal = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const currency = lines[0]?.currency ?? 'USD';
  const lockedLines = lines.filter((l) => l.earnedOnly && !unlocked.has(l.productId));
  const blocked = ready && lockedLines.length > 0;

  const checkout = async () => {
    if (lines.length === 0 || busy) return;
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) headers.Authorization = `Bearer ${await getIdToken(user)}`;
      const res = await fetch('/api/shop/checkout', {
        method: 'POST', headers,
        body: JSON.stringify({ items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })), ...(email ? { email } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        if (data.code === 'login') { window.location.href = `/login?next=${encodeURIComponent('/shop/cart')}`; return; }
        throw new Error(data.error || 'Could not start checkout');
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start checkout');
      setBusy(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-2xl font-black">Your cart is empty</p>
        <p className="text-sm text-white/60 mt-1">Nothing earned, nothing bought. Yet.</p>
        <Link href="/shop" className="inline-flex items-center gap-2 mt-6 rounded-2xl bg-accent text-black font-bold px-5 py-3">Back to the shop</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-4"><ChevronLeft className="w-4 h-4" /> Keep looking</Link>
      <h1 className="text-3xl font-black mb-6">Your cart</h1>
      <div className="space-y-3">
        {lines.map((l) => {
          const locked = l.earnedOnly && ready && !unlocked.has(l.productId);
          return (
            <div key={`${l.productId}-${l.variantId}`} className={`flex gap-3 rounded-2xl border p-3 ${locked ? 'border-accent/40' : 'border-white/10'}`} style={{ backgroundColor: 'var(--card-glass-bg)' }}>
              <Link href={`/shop/${l.slug}`} className="w-20 h-20 rounded-xl overflow-hidden bg-black/40 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image && <img src={l.image} alt="" className="w-full h-full object-cover" />}
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-snug">{l.name}</p>
                <p className="text-xs text-white/60">{l.variantLabel}</p>
                {locked && <p className="text-[11px] text-accent font-semibold mt-1 flex items-center gap-1"><Lock className="w-3 h-3" /> {signedIn ? 'Not earned yet' : 'Log in to check'}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => setQuantity(l.productId, l.variantId, l.quantity - 1)} className="w-7 h-7 rounded-lg border border-white/15 flex items-center justify-center" aria-label="Less"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                  <button onClick={() => setQuantity(l.productId, l.variantId, Math.min(10, l.quantity + 1))} className="w-7 h-7 rounded-lg border border-white/15 flex items-center justify-center" aria-label="More"><Plus className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeFromCart(l.productId, l.variantId)} className="ml-auto p-1.5 text-white/40 hover:text-danger" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-sm font-bold tabular-nums">{money(l.priceCents * l.quantity, l.currency)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 p-4 space-y-3" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        <div className="flex justify-between text-sm"><span className="text-white/60">Subtotal</span><span className="font-bold tabular-nums">{money(subtotal, currency)}</span></div>
        <p className="text-xs text-white/50">Shipping and any promo code are added on the next step.</p>
        {!signedIn && (
          <div>
            <label className="text-xs text-white/60 mb-1 block">Email for your order updates</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm" />
            <p className="text-[11px] text-white/40 mt-1">Members: <Link href={`/login?next=${encodeURIComponent('/shop/cart')}`} className="text-accent">log in</Link> to see it under your orders.</p>
          </div>
        )}
        {blocked ? (
          <div className="rounded-xl border border-accent/40 p-3 text-sm">
            <p className="font-bold text-accent flex items-center gap-1.5"><Lock className="w-4 h-4" /> Earned, not given</p>
            <p className="text-white/75 mt-1">{signedIn ? 'Remove the locked items or go finish the challenge that unlocks them.' : 'Log in to check whether you have unlocked the marked items.'}</p>
            {signedIn
              ? <Link href="/community/challenges" className="inline-flex items-center gap-1 mt-2 text-accent font-semibold">Challenges <ArrowRight className="w-4 h-4" /></Link>
              : <Link href={`/login?next=${encodeURIComponent('/shop/cart')}`} className="inline-flex items-center gap-1 mt-2 text-accent font-semibold">Log in <ArrowRight className="w-4 h-4" /></Link>}
          </div>
        ) : (
          <button onClick={checkout} disabled={busy || !ready} className="w-full rounded-2xl bg-accent text-black font-bold px-5 py-4 shadow-glow-sm disabled:opacity-60">
            {busy ? 'Opening checkout…' : 'Checkout'}
          </button>
        )}
      </div>
    </div>
  );
}
