'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import { ChevronLeft, Truck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { clearCart, money } from '@/lib/shop/cart';
import { StatusPill, StatusTrack } from './OrderStatus';
import type { ShopOrderStatus } from '@/types';

interface Order {
  id: string; status: ShopOrderStatus; currency: string; subtotalCents: number; shippingCents: number; totalCents: number;
  items: { name: string; variantLabel: string; quantity: number; priceCents: number; image: string | null }[];
  tracking: { carrier?: string; number?: string; url?: string } | null;
  shipping: { name: string; city: string; country: string } | null;
  createdAt: string | null; shippedAt: string | null; error: string | null;
}

/**
 * One order. Reached from the orders list (members) or from the
 * confirmation email's link with ?t= (guests). Polls every 20s while the
 * order is moving, so the page a person leaves open after paying goes from
 * "Paid" to "Sent to production" without a refresh.
 */
export function OrderView({ orderId }: { orderId: string }) {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const token = params.get('t');
  const justPaid = params.get('paid') === '1';
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => { if (justPaid) clearCart(); }, [justPaid]);

  useEffect(() => {
    if (loading) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await getIdToken(user)}`;
        const res = await fetch(`/api/shop/orders?id=${encodeURIComponent(orderId)}${token ? `&t=${encodeURIComponent(token)}` : ''}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (stop) return;
        const o: Order | null = res.ok ? data.order : null;
        setOrder(o);
        const moving = o && ['pending_payment', 'paid', 'submitted', 'in_production', 'shipped'].includes(o.status);
        if (moving) timer = setTimeout(load, o?.status === 'pending_payment' || o?.status === 'paid' ? 5000 : 20000);
      } catch { if (!stop) setOrder(null); }
    };
    load();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [orderId, token, user, loading]);

  if (order === undefined) return <div className="max-w-2xl mx-auto py-10 text-center text-white/50 text-sm">Loading your order…</div>;
  if (order === null) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-2xl font-black">Order not found</p>
        <p className="text-sm text-white/60 mt-1">{user ? 'This order is not on your account.' : 'Open the link from your confirmation email, or log in.'}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          {!user && <Link href={`/login?next=${encodeURIComponent(`/shop/orders/${orderId}`)}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent text-black font-bold px-5 py-3">Log in</Link>}
          <Link href="/shop/track" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-accent/40 text-accent font-bold px-5 py-3">Track by order number</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={user ? '/shop/orders' : '/shop'} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-4"><ChevronLeft className="w-4 h-4" /> {user ? 'Your orders' : 'Shop'}</Link>
      {justPaid && order.status !== 'pending_payment' && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 mb-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-300 flex-shrink-0" />
          <div><p className="font-bold">Order received.</p><p className="text-sm text-white/70">It is going to production now. You will get an email when it ships.</p></div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="text-[11px] text-white/40 mt-0.5">Keep this number to track it at /shop/track</p>
          <p className="text-xs text-white/50 mt-0.5">{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</p>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="rounded-2xl border border-white/10 p-4 mb-4" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        <StatusTrack status={order.status} />
        {order.status === 'pending_payment' && <p className="text-sm text-white/60 mt-3">Waiting for the payment to confirm…</p>}
        {order.error && <p className="text-sm text-amber-300 mt-3">{order.error}</p>}
        {order.tracking && (order.tracking.url || order.tracking.number) && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3">
            <Truck className="w-5 h-5 text-emerald-300 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{order.tracking.carrier || 'Shipped'}{order.tracking.number ? ` · ${order.tracking.number}` : ''}</p>
              {order.tracking.url && <a href={order.tracking.url} target="_blank" rel="noreferrer" className="text-sm text-accent font-semibold">Track the parcel →</a>}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 divide-y divide-white/8" style={{ backgroundColor: 'var(--card-glass-bg)' }}>
        {order.items.map((i, n) => (
          <div key={n} className="flex items-center gap-3 p-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.image && <img src={i.image} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{i.name}</p>
              <p className="text-xs text-white/60">{i.variantLabel} · ×{i.quantity}</p>
            </div>
            <p className="text-sm font-bold tabular-nums">{money(i.priceCents * i.quantity, order.currency)}</p>
          </div>
        ))}
        <div className="p-3 text-sm space-y-1">
          <div className="flex justify-between text-white/60"><span>Subtotal</span><span className="tabular-nums">{money(order.subtotalCents, order.currency)}</span></div>
          <div className="flex justify-between text-white/60"><span>Shipping</span><span className="tabular-nums">{order.shippingCents ? money(order.shippingCents, order.currency) : 'Free'}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{money(order.totalCents, order.currency)}</span></div>
        </div>
      </div>
      {order.shipping && <p className="text-xs text-white/50 mt-3">Shipping to {order.shipping.name}, {order.shipping.city}, {order.shipping.country}.</p>}
    </div>
  );
}
