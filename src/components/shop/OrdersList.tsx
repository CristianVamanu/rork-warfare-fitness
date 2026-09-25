'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getIdToken } from 'firebase/auth';
import { Package, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { money } from '@/lib/shop/cart';
import { StatusPill } from './OrderStatus';
import type { ShopOrderStatus } from '@/types';

interface Row {
  id: string; status: ShopOrderStatus; totalCents: number; currency: string; createdAt: string | null;
  items: { name: string; variantLabel: string; quantity: number; image: string | null }[];
}

export function OrdersList() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<Row[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setOrders([]); return; }
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/shop/orders', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch { setOrders([]); }
    })();
  }, [user, loading]);

  if (loading || orders === null) return <div className="max-w-2xl mx-auto py-10 text-center text-white/50 text-sm">Loading your orders…</div>;

  if (!user) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-2xl font-black">Your orders</p>
        <p className="text-sm text-white/60 mt-1">Log in to see them. Guest orders are in the email you got at checkout.</p>
        <Link href={`/login?next=${encodeURIComponent('/shop/orders')}`} className="inline-flex items-center gap-2 mt-6 rounded-2xl bg-accent text-black font-bold px-5 py-3">Log in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Your orders</h1>
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-white/10 p-12 text-center" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
          <Package className="w-8 h-8 text-white/30 mx-auto mb-3" />
          <p className="font-bold">No orders yet</p>
          <Link href="/shop" className="inline-flex items-center gap-2 mt-4 text-accent font-semibold">Go to the shop <ChevronRight className="w-4 h-4" /></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/shop/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 hover:border-accent/40 transition-colors" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.items[0]?.image && <img src={o.items[0].image} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                <p className="text-xs text-white/50 mt-0.5">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ''} · {money(o.totalCents, o.currency)}</p>
                <div className="mt-1.5"><StatusPill status={o.status} /></div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
