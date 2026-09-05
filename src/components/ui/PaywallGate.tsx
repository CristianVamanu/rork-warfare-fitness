'use client';

import { useState } from 'react';
import { Lock, Star, Crown, Sparkles, ExternalLink, Check } from 'lucide-react';
import { startPlanCheckout, confirmAndChangePlan } from '@/lib/checkout';
import { getPlanBillingPeriods, planHasAnyPrice, getActiveDiscountPercent, applyDiscount } from '@/lib/utils';
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
    return <PlanUpgradeScreen planName={activePlan?.name ?? 'current'} plans={plans} feature={feature} programId={programId} discountPercent={getActiveDiscountPercent(config)} />;
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

  // Purchasable plans that actually cover this locked feature — computed
  // once, up front, and used for BOTH the empty-state check and the map
  // below. Previously the empty-state check ran against every active plan
  // while the map separately filtered by feature coverage, so a real plan
  // set (active plans exist, none of which cover this specific feature)
  // rendered the "Choose one below" heading over an empty container instead
  // of the proper empty state.
  const activePlans = plans.filter((p) => p.active && planHasAnyPrice(p));
  const purchasablePlans = activePlans.filter((p) => planIncludesFeature(p, feature, programId));
  const trialDays = config.trialDays ?? 0;
  // A user who already used their trial (free or paid) gets full-price CTAs
  // and no trial copy — trialUsedAt is set once, by the webhook, the first
  // time either kind of trial actually fires.
  const effectiveTrialDays = profile?.trialUsedAt ? 0 : trialDays;
  // This wall was still promising a FREE trial after paid trial shipped,
  // while checkout charged trialPriceCents immediately — i.e. it told the
  // user "Start Free Trial" and then took their money, which is exactly how
  // you earn a chargeback (and the dispute webhook then revokes their
  // access too). Mirrors MembershipGuard's LockedScreen wording, including
  // naming the price the trial converts into.
  const paidTrialEnabled = !!config.paidTrialEnabled;
  const cardUpFrontTrial = !paidTrialEnabled && !!config.cardUpFrontTrial;
  const trialPrice = ((config.trialPriceCents ?? 100) / 100).toFixed(2);
  // Follows the admin-set mostPopular flag, same as the badge logic below —
  // was hardcoded to activePlans[0] regardless of which plan is featured.
  const featuredPlan = purchasablePlans.find((p) => p.mostPopular) ?? purchasablePlans[0];
  // Only priced when there is a single plan to price — with several on
  // screen the member chooses which price applies, and quoting the featured
  // plan's figure above cards charging different amounts reads as the price
  // they're about to be charged. Each card states its own.
  const featuredPrice = purchasablePlans.length === 1 && featuredPlan ? getPlanBillingPeriods(featuredPlan)[0] : null;
  const afterTrial = featuredPrice
    ? ` then $${featuredPrice.price.toFixed(2)}${featuredPrice.months === 1 ? '/mo' : ` every ${featuredPrice.months} months`}`
    : '';
  const trialLabel = effectiveTrialDays <= 0 ? '' : paidTrialEnabled
    ? ` · ${effectiveTrialDays} days for $${trialPrice}${afterTrial ? `,${afterTrial}` : ", then that plan's price"}`
    : cardUpFrontTrial
      ? ` · free for ${effectiveTrialDays} days${afterTrial ? `,${afterTrial}` : ''}, cancel any time`
      : ` · free for ${effectiveTrialDays} days${afterTrial ? `,${afterTrial}` : ''}`;
  const ctaLabel = effectiveTrialDays <= 0 ? 'Subscribe Now' : paidTrialEnabled ? `Start for $${trialPrice}` : 'Start Free Trial';

  return (
    // Same overflow trap as MembershipGuard's LockedScreen — a centred column
    // taller than its own box pushes its top edge off-screen. Top-aligned so
    // it cannot, however many plans are listed.
    <div className="px-4 py-10 flex flex-col items-center">
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

      {purchasablePlans.length === 0 ? (
        <Card className="p-6 text-center max-w-sm w-full">
          <p className="text-sm text-text-secondary">No plans are available to purchase right now — check back soon.</p>
        </Card>
      ) : (
        <div className="space-y-3 max-w-sm w-full">
          {purchasablePlans.map((plan) => {
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

function PlanUpgradeScreen({ planName, plans, feature, programId, discountPercent }: {
  planName: string; plans: MembershipPlan[]; feature: string | undefined; programId: string | undefined; discountPercent: number;
}) {
  const { user, refreshProfile } = useAuth();
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  // Was just a static "upgrade from your profile" message with no actual
  // way to act on it right here — the user had to remember which plan (if
  // any) covers this feature, leave the page, find it in Settings/Profile,
  // and start the upgrade blind. Now mirrors the landing page's own pricing
  // cards (features list, Most Popular badge, discount strike-through) in a
  // grid instead of a forced stack, same fix already applied to
  // MembershipGuard's LockedScreen — so this screen looks and reads like
  // the rest of the pricing UI instead of a stripped-down afterthought.
  const upgradePlans = plans.filter((p) => p.active && planHasAnyPrice(p) && planIncludesFeature(p, feature, programId));
  const anyMarkedPopular = upgradePlans.some((p) => p.mostPopular);

  async function handleUpgrade(planId: string, planName: string, periodMonths: 1 | 3 | 6 | 12) {
    if (!user) return;
    setChangingPlanId(planId);
    // Switches the existing subscription's price directly (with Stripe
    // prorating the difference) — not the billing portal, which can't offer
    // a plan switcher here at all (see /api/stripe/change-plan's own
    // comment: these plans only ever exist as inline price_data, never as
    // permanent Stripe Price objects the portal could list). Previews the
    // proration amount and confirms with the user before committing.
    const { changed, error } = await confirmAndChangePlan(user, planId, planName, periodMonths);
    if (error) toast.error(error);
    else if (changed) {
      toast.success('Plan updated');
      await refreshProfile().catch(() => {});
    }
    setChangingPlanId(null);
  }

  return (
    <div className="px-4 py-12 flex flex-col items-center min-h-[40vh]">
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
        <div className={`grid gap-4 items-stretch w-full ${
          upgradePlans.length >= 3 ? 'max-w-4xl sm:grid-cols-2 lg:grid-cols-3' : upgradePlans.length === 2 ? 'max-w-2xl sm:grid-cols-2' : 'max-w-sm'
        }`}>
          {upgradePlans.map((plan) => {
            const periods = getPlanBillingPeriods(plan);
            const displayPeriod = periods[0];
            const isFeatured = anyMarkedPopular ? !!plan.mostPopular : false;
            return (
              <Card key={plan.id} className={`relative p-5 h-full flex flex-col ${isFeatured ? 'border-2 border-accent' : 'border-accent/20'}`}>
                {isFeatured && (
                  <div className="absolute -top-3 left-4 px-2.5 py-0.5 bg-accent rounded-full">
                    <span className="text-[10px] font-bold text-black uppercase tracking-wide">Most Popular</span>
                  </div>
                )}
                {discountPercent > 0 && (
                  <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-danger rounded-full">
                    <span className="text-[10px] font-bold text-white">{discountPercent}% OFF 1ST</span>
                  </div>
                )}
                <p className="text-sm font-bold text-white">{plan.name}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-2xl font-black text-white">${applyDiscount(displayPeriod.price, discountPercent).toFixed(2)}</span>
                      <span className="text-sm text-text-tertiary line-through">${displayPeriod.price.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-white">${displayPeriod.price.toFixed(2)}</span>
                  )}
                  <span className="text-sm font-medium text-text-secondary">{displayPeriod.months === 1 ? '/mo' : ` / ${displayPeriod.months}mo`}</span>
                </div>
                {/* Discount coupon is duration:'once' — first payment only.
                    See MembershipGuard for the full rationale. */}
                {discountPercent > 0 && (
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    First payment only — renews at ${displayPeriod.price.toFixed(2)}{displayPeriod.months === 1 ? '/mo' : ` / ${displayPeriod.months}mo`}
                  </p>
                )}
                {plan.description && <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>}
                {plan.features.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-text-secondary">
                        <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-4">
                  <Button fullWidth variant={isFeatured ? 'primary' : 'secondary'} onClick={() => handleUpgrade(plan.id, plan.name, displayPeriod.months)} loading={changingPlanId === plan.id}>
                    <ExternalLink className="w-4 h-4" /> {changingPlanId === plan.id ? 'Updating Plan…' : `Upgrade to ${plan.name}`}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {upgradePlans.length > 0 && (
        <p className="text-[10px] text-text-tertiary text-center mt-4">Change plans anytime — prorated automatically by Stripe.</p>
      )}
    </div>
  );
}
