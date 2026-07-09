'use client';

import { useEffect, useState } from 'react';
import { Lock, Star, Crown } from 'lucide-react';
import { getMembershipConfig } from '@/lib/firestore';
import { startMembershipCheckout } from '@/lib/checkout';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';
import type { MembershipConfig } from '@/types';

interface Props {
  feature?: string; // 'barcode' | 'nutrition-ai' | undefined (means fullLock check only)
  programId?: string;
  children: React.ReactNode;
}

export function PaywallGate({ feature, programId, children }: Props) {
  const { user, profile } = useAuth();
  const [config, setConfig] = useState<MembershipConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    getMembershipConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const hasMembership = profile?.membership?.status === 'active';

  // Check free trial: if user joined within trialDays, treat as member
  const trialDays = (config as MembershipConfig & { trialDays?: number })?.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile?.createdAt) return false;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    const ms = Date.now() - created.getTime();
    return ms < trialDays * 24 * 60 * 60 * 1000;
  })();

  if (!config || !config.enabled || hasMembership || inTrial) {
    return <>{children}</>;
  }

  const isLocked =
    config.fullLock ||
    (feature && config.lockedFeatures.includes(feature)) ||
    (programId && config.lockedProgramIds.includes(programId));

  if (!isLocked) return <>{children}</>;

  async function handleSubscribe() {
    if (!user) return;
    setSubscribing(true);
    const err = await startMembershipCheckout(user);
    if (err) setSubscribing(false);
  }

  const trialLabel = trialDays > 0 ? ` · ${trialDays}-day free trial` : '';
  const price = config.fee > 0 ? `$${config.fee.toFixed(2)}/mo${trialLabel}` : 'Premium';
  const planName = config.planName?.trim() || 'Membership';

  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
      <Card className="p-8 text-center max-w-sm w-full border-accent/30">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Premium Feature</span>
        </div>
        <h3 className="text-lg font-black text-white mb-2">Members Only</h3>
        <p className="text-text-secondary text-sm mb-4">
          This feature is available to active members. Subscribe below to unlock it.
        </p>
        <div className="p-3 bg-surface-elevated rounded-xl mb-4">
          <p className="text-2xl font-black text-white">{price}</p>
          <p className="text-xs text-text-secondary mt-0.5">{planName.toLowerCase()}</p>
        </div>
        {config.fee > 0 && (
          <Button fullWidth onClick={handleSubscribe} loading={subscribing}>
            <Crown className="w-4 h-4" /> {subscribing ? 'Opening Checkout…' : (trialDays > 0 ? 'Start Free Trial' : 'Subscribe Now')}
          </Button>
        )}
      </Card>
    </div>
  );
}
