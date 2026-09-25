import type { Metadata } from 'next';
import { ShopShell } from '@/components/shop/ShopShell';
import { OrdersList } from '@/components/shop/OrdersList';

export const metadata: Metadata = { title: 'Your orders — Warfare Fitness', robots: { index: false } };

export default function OrdersPage() {
  return (
    <ShopShell>
      <OrdersList />
    </ShopShell>
  );
}
