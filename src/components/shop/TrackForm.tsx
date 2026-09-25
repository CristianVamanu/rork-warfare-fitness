'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PackageSearch, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * "Track my order": order number + email → the order page. Members get a
 * pointer to their list too, since that needs no typing at all.
 */
export function TrackForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/shop/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber, email }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not find that order');
      router.push(`/shop/orders/${data.order.id}?t=${encodeURIComponent(data.token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find that order');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Link href="/shop" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-4"><ChevronLeft className="w-4 h-4" /> Shop</Link>
      <div className="rounded-3xl border border-white/10 p-6" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-4"><PackageSearch className="w-6 h-6 text-accent" /></div>
        <h1 className="text-2xl font-black">Track your order</h1>
        <p className="text-sm text-white/60 mt-1">The order number is on your confirmation email and on the order page, like <span className="font-mono text-white/80">#7K2M9QAB</span>.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Order number</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="#7K2M9QAB" autoCapitalize="characters" autoComplete="off" className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-base font-mono tracking-wider" />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Email used at checkout</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-base" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy || !orderNumber.trim() || !email.trim()} className="w-full rounded-2xl bg-accent text-black font-bold px-5 py-3.5 shadow-glow-sm disabled:opacity-60">
            {busy ? 'Looking…' : 'Find my order'}
          </button>
        </form>
        <p className="text-xs text-white/50 mt-4">
          {user ? <>Signed in? Your orders are all under <Link href="/shop/orders" className="text-accent font-semibold">Your orders</Link>.</> : <>Members: <Link href={`/login?next=${encodeURIComponent('/shop/orders')}`} className="text-accent font-semibold">log in</Link> to see every order without typing.</>}
        </p>
      </div>
    </div>
  );
}
