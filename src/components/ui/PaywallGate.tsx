'use client';

import { useEffect, useState } from 'react';
import { Lock, Star, Crown } from 'lucide-react';
import { getMembershipConfig, getMembershipPlans } from '@/lib/firestore';
import { startPlanCheckout } from '@/lib/checkout';
import { getPlanBillingPeriods, planHasAnyPrice } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';
import type { MembershipConfig, MembershipPlan } from '@/types';

interface Props {
  feature?: string; // 'barcode' | 'nutrition-ai' | 'meal-planner' | undefined (means fullLock check only)
  programId?: string;
  children: React.ReactNode;
}

/**
 * Two layers of gating, in order:
 *  1. MembershipConfig.lockedFeatures — does this tool require ANY paid
 *     plan at all? (global, admin toggles per feature)
 *  2. MembershipPlan.featureAccess — for an actual paying member, does
 *     their SPECIFIC plan include this tool? Empty list = every tool.
 * A non-member hitting a locked feature sees every active plan to choose
 * from; a member whose plan doesn't cover it sees an upgrade prompt
 * instead of a duplicate "subscribe" flow.
 */
export function PaywallGate({ feature, programId, children }: Props) {
  const { user, profile } = useAuth();
  const [config, setConfig] = useState<MembershipConfig | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getMembershipConfig().catch(() => null),
      getMembershipPlans().catch(() => []),
    ])
      .then(([cfg, mp]) => { setConfig(cfg); setPlans(mp); })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const hasMembership = profile?.membership?.status === 'active';

  // Check free trial: if user joined within trialDays, treat as member —
  // full access to every feature regardless of plan, no exceptions.
  const trialDays = config?.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile?.createdAt) return false;
    const created = (profile.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(profile.createdAt as string);
    const ms = Date.now() - created.getTime();
    return ms < trialDays * 24 * 60 * 60 * 1000;
  })();

  if (!config || !config.enabled || inTrial) {
    return <>{children}</>;
  }

  // Paying member — check their specific plan's feature access
  if (hasMembership) {
    const activePlan = profile?.membership?.planId
      ? plans.find((p) => p.id === profile.membership!.planId) ?? null
      : null;
    const planRestricts = !!activePlan?.featureAccess && activePlan.featureAccess.length > 0;

    if (!planRestricts) return <>{children}</>; // no plan on file, or plan grants everything

    const featureAllowed = !feature || activePlan!.featureAccess.includes(feature);
    const programAllowed = !programId || activePlan!.featureAccess.includes('premium-programs');
    if (featureAllowed && programAllowed) return <>{children}</>;
    return <PlanUpgradeScreen planName={activePlan!.name} />;
  }

  // Non-member — does this specific tool require a paid plan at all?
  const isLocked =
    config.fullLock ||
    (feature && (config.lockedFeatures ?? []).includes(feature)) ||
    (programId && (config.lockedProgramIds ?? []).includes(programId));

  if (!isLocked) return <>{children}</>;

  async function handleSubscribe(planId: string) {
    if (!user) return;
    const plan = plans.find((p) => p.id === planId);
    const defaultMonths = plan ? getPlanBillingPeriods(plan)[0]?.months : undefined;
    setSubscribingId(planId);
    const err = await startPlanCheckout(user, planId, defaultMonths ?? 1);
    if (err) setSubscribingId(null);
  }

  const activePlans = plans.filter((p) => p.active && planHasAnyPrice(p));
  const trialLabel = trialDays > 0 ? ` · ${trialDays}-day free trial` : '';

  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
      <div className="text-center max-w-sm w-full mb-5">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Premium Feature</span>
        </div>
        <h3 className="text-lg font-black text-white mb-2">Members Only</h3>
        <p className="text-text-secondary text-sm">
          This feature is available on select plans{trialLabel}. Choose one below to unlock it.
        </p>
      </div>

      {activePlans.length === 0 ? (
        <Card className="p-6 text-center max-w-sm w-full">
          <p className="text-sm text-text-secondary">No plans are available to purchase right now — check back soon.</p>
        </Card>
      ) : (
        <div className="space-y-3 max-w-sm w-full">
          {activePlans.map((plan) => {
            const includesThis = plan.featureAccess.length === 0
              || (!feature || plan.featureAccess.includes(feature))
              && (!programId || plan.featureAccess.includes('premium-programs'));
            if (!includesThis) return null;
            const displayPeriod = getPlanBillingPeriods(plan)[0];
            return (
              <Card key={plan.id} className="p-5 border-accent/20">
                <p className="text-sm font-bold text-white">{plan.name}</p>
                <p className="text-2xl font-black text-white mt-1">
                  ${displayPeriod.price.toFixed(2)}
                  <span className="text-sm font-medium text-text-secondary">{displayPeriod.months === 1 ? '/mo' : ` / ${displayPeriod.months}mo`}</span>
                </p>
                {plan.description && <p className="text-xs text-text-secondary mt-1.5">{plan.description}</p>}
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

function PlanUpgradeScreen({ planName }: { planName: string }) {
  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
      <Card className="p-8 text-center max-w-sm w-full border-accent/30">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Not Included In Your Plan</span>
        </div>
        <h3 className="text-lg font-black text-white mb-2">Upgrade Needed</h3>
        <p className="text-text-secondary text-sm">
          Your current <span className="text-white font-medium">{planName}</span> plan doesn&apos;t include this feature. Upgrade your plan from your profile to unlock it.
        </p>
      </Card>
    </div>
  );
}
