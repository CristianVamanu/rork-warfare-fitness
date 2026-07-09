'use client';

import { useEffect, useState } from 'react';
import { Lock, Star, Crown } from 'lucide-react';
import { getMembershipConfig } from '@/lib/firestore';
import { startMembershipCheckout } from '@/lib/checkout';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';
import type { MembershipConfig } from '@/types';

// Pages that are always accessible regardless of membership
const FREE_PATHS = ['/dashboard', '/settings', '/messages', '/notifications', '/profile', '/banned', '/onboarding'];

interface Props {
  pathname: string;
  children: React.ReactNode;
}

export function MembershipGuard({ pathname, children }: Props) {
  const { profile } = useAuth();
  const [config, setConfig] = useState<MembershipConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMembershipConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoaded(true));
  }, []);

  // While loading, just render children (avoid flash)
  if (!loaded) return <>{children}</>;

  // No config or membership disabled → free access
  if (!config || !config.enabled) return <>{children}</>;

  // Admins/trainers always bypass
  if (profile?.role === 'admin' || profile?.role === 'trainer') return <>{children}</>;

  // Check if user has active membership
  const hasMembership = profile?.membership?.status === 'active';

  // Check free trial
  const trialDays = (config as MembershipConfig & { trialDays?: number })?.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile?.createdAt) return false;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    return Date.now() - created.getTime() < trialDays * 24 * 60 * 60 * 1000;
  })();

  if (hasMembership || inTrial) return <>{children}</>;

  // Full lock — block everything except safe paths
  if (config.fullLock) {
    const isFree = FREE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (!isFree) return <LockedScreen config={config} trialDays={trialDays} />;
  }

  return <>{children}</>;
}

function LockedScreen({ config, trialDays }: { config: MembershipConfig; trialDays: number }) {
  const { user } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const trialLabel = trialDays > 0 ? ` · ${trialDays}-day free trial` : '';
  const price = config.fee > 0 ? `$${config.fee.toFixed(2)}/mo${trialLabel}` : 'Members only';
  const planName = config.planName?.trim() || 'Membership';

  async function handleSubscribe() {
    if (!user) return;
    setSubscribing(true);
    const err = await startMembershipCheckout(user);
    if (err) setSubscribing(false);
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <Card className="p-8 text-center max-w-sm w-full border-accent/30">
        <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-3">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Members Only</span>
        </div>
        <h3 className="text-xl font-black text-white mb-2">{planName} Required</h3>
        <p className="text-text-secondary text-sm mb-5">
          This platform is for active members. Subscribe below to unlock full access.
        </p>
        <div className="p-4 bg-surface-elevated rounded-xl mb-4">
          <p className="text-3xl font-black text-white">{price}</p>
          <p className="text-xs text-text-secondary mt-0.5">{planName.toLowerCase()} plan</p>
        </div>
        {config.fee > 0 ? (
          <Button fullWidth onClick={handleSubscribe} loading={subscribing}>
            <Crown className="w-4 h-4" /> {subscribing ? 'Opening Checkout…' : (trialDays > 0 ? 'Start Free Trial' : 'Subscribe Now')}
          </Button>
        ) : (
          <p className="text-xs text-text-tertiary">
            Already a member? Ask your coach to grant you access.
          </p>
        )}
      </Card>
    </div>
  );
}
