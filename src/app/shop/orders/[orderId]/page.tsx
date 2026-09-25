import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopShell } from '@/components/shop/ShopShell';
import { OrderView } from '@/components/shop/OrderView';

export const metadata: Metadata = { title: 'Order — Warfare Fitness', robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <ShopShell>
      <Suspense fallback={<div className="max-w-2xl mx-auto py-10 text-center text-white/50 text-sm">Loading your order…</div>}>
        <OrderView orderId={orderId} />
      </Suspense>
    </ShopShell>
  );
}
