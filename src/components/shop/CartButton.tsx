'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/shop/cart';

/** Floating cart, hidden on the cart page itself and when empty. */
export function CartButton() {
  const lines = useCart();
  const pathname = usePathname();
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  if (count === 0 || pathname === '/shop/cart') return null;
  return (
    <Link
      href="/shop/cart"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-accent text-black font-bold px-5 py-3 shadow-glow-sm"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom) / 2)' }}
      aria-label={`Cart, ${count} items`}
    >
      <ShoppingBag className="w-5 h-5" />
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}
