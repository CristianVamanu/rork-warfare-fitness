'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Star, Crown } from 'lucide-react';
import { getMembershipConfig, getMembershipPlans } from '@/lib/firestore';
import { startPlanCheckout } from '@/lib/checkout';
import { getPlanBillingPeriods, planHasAnyPrice } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';
import type { MembershipConfig, MembershipPlan, PlanBillingPeriodMonths } from '@/types';

// Pages that are always accessible regardless of membership
const FREE_PATHS = ['/dashboard', '/settings', '/messages', '/notifications', '/profile', '/banned', '/onboarding', '/goals'];

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
  const trialDays = config?.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile?.createdAt) return false;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    return Date.now() - created.getTime() < trialDays * 24 * 60 * 60 * 1000;
  })();

  if (hasMembership || inTrial) return <>{children}</>;

  // Full lock — block everything except safe paths
  if (config.fullLock) {
    const isFree = FREE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (!isFree) return <LockedScreen trialDays={trialDays} />;
  }

  return <>{children}</>;
}

function LockedScreen({ trialDays }: { trialDays: number }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Record<string, PlanBillingPeriodMonths>>({});
  const trialLabel = trialDays > 0 ? ` · ${trialDays}-day free trial` : '';

  useEffect(() => {
    getMembershipPlans().then((p) => setPlans(p.filter((x) => x.active && planHasAnyPrice(x)))).catch(() => {});
  }, []);

  async function handleSubscribe(planId: string) {
    if (!user) return;
    const plan = plans.find((p) => p.id === planId);
    const defaultMonths = plan ? getPlanBillingPeriods(plan)[0]?.months : undefined;
    setSubscribingId(planId);
    const err = await startPlanCheckout(user, planId, selectedPeriod[planId] ?? defaultMonths ?? 1);
    if (err) {
      toast.error(err);
      setSubscribingId(null);
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-sm w-full mb-5">
        <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-3">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Members Only</span>
        </div>
        <h3 className="text-xl font-black text-white mb-2">Choose a Plan</h3>
        <p className="text-text-secondary text-sm">
          This platform is for active members{trialLabel}. Subscribe below to unlock full access.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card className="p-6 text-center max-w-sm w-full">
          <p className="text-xs text-text-tertiary">Already a member? Ask your coach to grant you access.</p>
        </Card>
      ) : (
        <div className="space-y-3 max-w-sm w-full">
          {plans.map((plan) => {
            const periods = getPlanBillingPeriods(plan);
            const period = selectedPeriod[plan.id] ?? 1;
            const active = periods.find((p) => p.months === period) ?? periods[0];
            return (
              <Card key={plan.id} className="p-5 border-accent/20">
                <p className="text-sm font-bold text-white">{plan.name}</p>
                <p className="text-2xl font-black text-white mt-1">
                  ${active.price.toFixed(2)}
                  <span className="text-sm font-medium text-text-secondary">{active.months === 1 ? '/mo' : ` / ${active.months}mo`}</span>
                </p>
                {plan.description && <p className="text-xs text-text-secondary mt-1.5">{plan.description}</p>}
                {periods.length > 1 && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {periods.map((p) => (
                      <button
                        key={p.months}
                        onClick={() => setSelectedPeriod((s) => ({ ...s, [plan.id]: p.months }))}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${p.months === period ? 'bg-accent text-black border-accent' : 'bg-surface-elevated text-text-secondary border-border'}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <Button fullWidth className="mt-4" onClick={() => handleSubscribe(plan.id)} loading={subscribingId === plan.id}>
                  <Crown className="w-4 h-4" /> {subscribingId === plan.id ? 'Opening Checkout…' : (trialDays > 0 ? 'Start Free Trial' : 'Subscribe Now')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
