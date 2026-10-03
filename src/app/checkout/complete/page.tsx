import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { CompleteClient } from './CompleteClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirming payment',
  robots: { index: false, follow: false },
};

export default function CheckoutCompletePage() {
  return (
    <Suspense fallback={<BrandSplash label="Confirming your payment" />}>
      <CompleteClient />
    </Suspense>
  );
}
