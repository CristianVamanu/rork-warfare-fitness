'use client';

/**
 * Membership inside the native apps (see src/lib/native/billing.ts). Every
 * in-app purchase entry point lands here. With RevenueCat configured
 * (NEXT_PUBLIC_REVENUECAT_ANDROID_KEY) it sells Google Play subscriptions;
 * without it, it is the neutral notice: no price, no link to an external
 * checkout, as the stores' billing rules require.
 */
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { hasActiveSubscription } from '@/lib/membership';
import { inAppPurchasesEnabled } from '@/lib/native/purchases';
import { PlayPaywall } from '@/components/ui/PlayPaywall';

export default function MembershipNoticePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const active = !!profile && hasActiveSubscription(profile);
  const sellsInApp = !active && !!user && inAppPurchasesEnabled();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card glass className="p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-accent-muted rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">{active ? 'Membership active' : sellsInApp ? 'Become a member' : 'Membership required'}</h1>
          <p className="text-text-secondary text-sm mt-2">
            {active
              ? profile?.membership && (profile.membership as { source?: string }).source === 'google_play'
                ? 'Your membership is billed through Google Play. Manage or cancel it in Google Play → Subscriptions.'
                : 'Your membership is managed on the Warfare Fitness website, including plan changes and billing.'
              : sellsInApp
                ? 'Every program, the AI coach, nutrition tracking and your weekly report.'
                : 'This part of Warfare Fitness is for members. Memberships are managed on the Warfare Fitness website, not in this app.'}
          </p>
        </div>
        {sellsInApp && user && <PlayPaywall uid={user.uid} />}
        <Button fullWidth variant="secondary" onClick={() => router.replace('/dashboard')}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </Card>
    </div>
  );
}
