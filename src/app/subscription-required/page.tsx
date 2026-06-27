'use client';

import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function SubscriptionRequiredPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card glass className="p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto">
          <CreditCard className="w-8 h-8 text-danger" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Subscription Required</h1>
          <p className="text-text-secondary text-sm mt-2">
            Your trainer subscription is no longer active. Please renew to access the admin panel.
          </p>
        </div>
        <Button fullWidth onClick={() => router.replace('/dashboard')}>
          Back to App
        </Button>
      </Card>
    </div>
  );
}
