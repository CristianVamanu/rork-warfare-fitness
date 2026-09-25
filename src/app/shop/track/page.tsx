import type { Metadata } from 'next';
import { ShopShell } from '@/components/shop/ShopShell';
import { TrackForm } from '@/components/shop/TrackForm';

export const metadata: Metadata = { title: 'Track your order — Warfare Fitness', description: 'Find your order by number and email and follow it to your door.' };

export default function TrackPage() {
  return (
    <ShopShell>
      <TrackForm />
    </ShopShell>
  );
}
