import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { CheckoutClient } from './CheckoutClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

// Suspense: useSearchParams in the client component needs a boundary, and
// the splash it falls back to is the same one the rest of the app waits on.
export default function CheckoutPage() {
  return (
    <Suspense fallback={<BrandSplash label="Preparing secure checkout" />}>
      <CheckoutClient />
    </Suspense>
  );
}
