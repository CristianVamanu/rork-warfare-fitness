'use client';

import { useState } from 'react';
import { Lock, Star, Crown, Sparkles, ExternalLink } from 'lucide-react';
import { startPlanCheckout, openBillingPortal } from '@/lib/checkout';
import { getPlanBillingPeriods, planHasAnyPrice } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
import { Card } from './Card';
import { Button } from './Button';
import toast from 'react-hot-toast';
import type { MembershipPlan } from '@/types';

/** Does this plan's featureAccess actually cover what's currently locked?
 * Empty featureAccess list = the plan includes everything (no restriction). */
function planIncludesFeature(plan: MembershipPlan, feature: string | undefined, programId: string | undefined): boolean {
  return plan.featureAccess.length === 0
    || ((!feature || plan.featureAccess.includes(feature))
      && (!programId || plan.featureAccess.includes('premium-programs')));
}

interface Props {
  feature?: string; // 'barcode' | 'nutrition-ai' | 'meal-planner' | undefined (means fullLock check only)
  programId?: string;
  children: React.ReactNode;
  // The one-time "taste" grace period only actually ends once the caller
  // explicitly calls consumeAiTaste() after a successful result (the AI
  // tool pages do this). Features with no such callback — community,
  // quests, breathing, etc. — would otherwise show the taste banner
  // forever and never actually lock, since `tasted` would never flip
  // true. Set this for any feature that isn't wired up to consumeAiTaste.
  noTaste?: boolean;
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
 *
 * Taste-then-paywall: a non-member's first visit to a locked AI tool (one
 * that hasn't been tasted yet — see useFeatureAccess) renders through
 * instead of blocking, with a small banner instead of a full wall. The page
 * itself calls consumeAiTaste() after an actual successful result, which
 * flips `tasted` true and the wall shows on the next visit.
 */
export function PaywallGate({ feature, programId, children, noTaste }: Props) {
  const { user, profile } = useAuth();
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const { loaded, config, plans, hasMembership, inTrial, isLocked, tasteAvailable } = useFeatureAccess(feature, programId);

  if (!loaded) return null;
  if (!config || !config.enabled || inTrial) return <>{children}</>;

  if (hasMembership) {
    if (!isLocked) return <>{children}</>;
    const activePlan = profile?.membership?.planId
      ? plans.find((p) => p.id === profile.membership!.planId) ?? null
      : null;
    return <PlanUpgradeScreen planName={activePlan?.name ?? 'current'} plans={plans} feature={feature} programId={programId} />;
  }

  if (!isLocked) return <>{children}</>;

  if (tasteAvailable && !noTaste) {
    return (
      <>
        <div className="mx-4 mt-3 p-2.5 rounded-xl bg-accent-muted border border-accent/20 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          <p className="text-xs text-accent font-medium">Your free try of this tool — upgrade after to keep using it.</p>
        </div>
        {children}
      </>
    );
  }

  async function handleSubscribe(planId: string) {
    if (!user) return;
    const plan = plans.find((p) => p.id === planId);
    const defaultMonths = plan ? getPlanBillingPeriods(plan)[0]?.months : undefined;
    setSubscribingId(planId);
    const err = await startPlanCheckout(user, planId, defaultMonths ?? 1);
    if (err) setSubscribingId(null);
  }

  const activePlans = plans.filter((p) => p.active && planHasAnyPrice(p));
  const trialDays = config.trialDays ?? 0;
  // This wall was still promising a FREE trial after paid trial shipped,
  // while checkout charged trialPriceCents immediately — i.e. it told the
  // user "Start Free Trial" and then took their money, which is exactly how
  // you earn a chargeback (and the dispute webhook then revokes their
  // access too). Mirrors MembershipGuard's LockedScreen wording, including
  // naming the price the trial converts into.
  const paidTrialEnabled = !!config.paidTrialEnabled;
  const trialPrice = ((config.trialPriceCents ?? 100) / 100).toFixed(2);
  const featuredPrice = activePlans[0] ? getPlanBillingPeriods(activePlans[0])[0] : null;
  const afterTrial = featuredPrice
    ? ` then $${featuredPrice.price.toFixed(2)}${featuredPrice.months === 1 ? '/mo' : ` every ${featuredPrice.months} months`}`
    : '';
  const trialLabel = trialDays <= 0 ? '' : paidTrialEnabled
    ? ` · $${trialPrice} for ${trialDays} days,${afterTrial || ' then your plan price applies'}`
    : ` · ${trialDays}-day free trial${afterTrial ? `,${afterTrial}` : ''}`;
  const ctaLabel = trialDays <= 0 ? 'Subscribe Now' : paidTrialEnabled ? `Start for $${trialPrice}` : 'Start Free Trial';

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
            if (!planIncludesFeature(plan, feature, programId)) return null;
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
                  <Crown className="w-4 h-4" /> {subscribingId === plan.id ? 'Opening Checkout…' : ctaLabel}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlanUpgradeScreen({ planName, plans, feature, programId }: {
  planName: string; plans: MembershipPlan[]; feature: string | undefined; programId: string | undefined;
}) {
  const { user } = useAuth();
  const [openingPortal, setOpeningPortal] = useState(false);
  // Was just a static "upgrade from your profile" message with no actual
  // way to act on it right here — the user had to remember which plan (if
  // any) covers this feature, leave the page, find it in Settings/Profile,
  // and start the upgrade blind. Lists the plans that actually cover what's
  // locked and opens Stripe's billing portal directly — the correct path
  // for an EXISTING subscriber (startPlanCheckout unconditionally rejects
  // anyone with an active membership; only the portal handles a plan
  // change/proration for someone already paying).
  const upgradePlans = plans.filter((p) => p.active && planHasAnyPrice(p) && planIncludesFeature(p, feature, programId));

  async function handleUpgrade() {
    if (!user) return;
    setOpeningPortal(true);
    const err = await openBillingPortal(user);
    if (err) { toast.error(err); setOpeningPortal(false); }
  }

  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
      <div className="text-center max-w-sm w-full mb-5">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Not Included In Your Plan</span>
        </div>
        <h3 className="text-lg font-black text-white mb-2">Upgrade Needed</h3>
        <p className="text-text-secondary text-sm">
          Your current <span className="text-white font-medium">{planName}</span> plan doesn&apos;t include this feature.
        </p>
      </div>

      {upgradePlans.length === 0 ? (
        <Card className="p-6 text-center max-w-sm w-full">
          <p className="text-sm text-text-secondary">No other plan currently covers this feature — check back soon, or contact support.</p>
        </Card>
      ) : (
        <div className="space-y-3 max-w-sm w-full">
          {upgradePlans.map((plan) => {
            const displayPeriod = getPlanBillingPeriods(plan)[0];
            return (
              <Card key={plan.id} className="p-5 border-accent/20">
                <p className="text-sm font-bold text-white">{plan.name}</p>
                <p className="text-2xl font-black text-white mt-1">
                  ${displayPeriod.price.toFixed(2)}
                  <span className="text-sm font-medium text-text-secondary">{displayPeriod.months === 1 ? '/mo' : ` / ${displayPeriod.months}mo`}</span>
                </p>
                {plan.description && <p className="text-xs text-text-secondary mt-1.5">{plan.description}</p>}
              </Card>
            );
          })}
          <Button fullWidth variant="secondary" onClick={handleUpgrade} loading={openingPortal}>
            <ExternalLink className="w-4 h-4" /> Upgrade in Billing Portal
          </Button>
          <p className="text-[10px] text-text-tertiary text-center">Change plans anytime — prorated automatically by Stripe.</p>
        </div>
      )}
    </div>
  );
}
