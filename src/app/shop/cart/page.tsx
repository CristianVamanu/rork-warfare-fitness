import type { Metadata } from 'next';
import { ShopShell } from '@/components/shop/ShopShell';
import { CartView } from '@/components/shop/CartView';

export const metadata: Metadata = { title: 'Your cart — Warfare Fitness', robots: { index: false } };

export default function CartPage() {
  return (
    <ShopShell>
      <CartView />
    </ShopShell>
  );
}
