'use client';

/**
 * The neutral membership notice shown inside the native apps wherever the
 * website would offer a plan or a checkout (see src/lib/native/billing.ts).
 * Deliberately no price, no plan names, no button to buy and no link to an
 * external checkout: that is what the stores' billing rules require of an
 * app that does not use their billing.
 */
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { hasActiveSubscription } from '@/lib/membership';

export default function MembershipNoticePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const active = !!profile && hasActiveSubscription(profile);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card glass className="p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-accent-muted rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">{active ? 'Membership active' : 'Membership required'}</h1>
          <p className="text-text-secondary text-sm mt-2">
            {active
              ? 'Your membership is managed on the Warfare Fitness website, including plan changes and billing.'
              : 'This part of Warfare Fitness is for members. Memberships are managed on the Warfare Fitness website, not in this app.'}
          </p>
        </div>
        <Button fullWidth variant="secondary" onClick={() => router.replace('/dashboard')}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </Card>
    </div>
  );
}
