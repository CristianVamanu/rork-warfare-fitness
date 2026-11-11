'use client';

/**
 * What the native apps show in place of a plan picker or an upgrade offer.
 * No prices, no plan names, no purchase button, no external checkout link
 * (store billing rules for an app that does not use store billing).
 */
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PlayPaywall } from './PlayPaywall';
import { Card } from './Card';
import { inAppPurchasesEnabled } from '@/lib/native/purchases';

export function NativeMembershipNotice({ title = 'Members only', feature }: { title?: string; feature?: string }) {
  const { user } = useAuth();
  return (
    <div className="px-4 pt-10 max-w-sm mx-auto text-center">
      <Card className="p-6 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6 text-accent" />
        </div>
        <p className="text-sm text-white font-semibold">{inAppPurchasesEnabled() && user && title === 'Members only' ? 'Become a member' : title}</p>
        {inAppPurchasesEnabled() && user ? (
          <>
            <p className="text-xs text-text-secondary">
              {feature ? `${feature} isn't included in your current membership. ` : ''}
              Every program, the AI coach, nutrition tracking and your weekly report.
            </p>
            <PlayPaywall uid={user.uid} />
          </>
        ) : (
          <p className="text-xs text-text-secondary">
            {feature ? `${feature} isn't included in your current membership. ` : ''}
            Memberships are managed on the Warfare Fitness website, not in this app.
          </p>
        )}
      </Card>
    </div>
  );
}
