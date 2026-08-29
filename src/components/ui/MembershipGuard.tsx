'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Star, Crown, Check } from 'lucide-react';
import { getMembershipConfig, getMembershipPlans } from '@/lib/firestore';
import { startPlanCheckout } from '@/lib/checkout';
import { getPlanBillingPeriods, planHasAnyPrice, getActiveDiscountPercent, applyDiscount } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { isInFreeTrial } from '@/lib/membership';
import { Card } from './Card';
import { Button } from './Button';
import type { MembershipConfig, MembershipPlan, PlanBillingPeriodMonths } from '@/types';

// Pages that are always accessible regardless of membership — account
// management, not "the product" itself. /dashboard is deliberately NOT
// unconditional (see ALWAYS_FREE_PATHS below): under a free trial it's
// meant to be visible immediately (there's no paywall to show yet, the
// trial itself already grants access), but under a paid trial leaving it
// exempt would let a brand-new signup wander the dashboard shell forever
// without ever having to check out — the entire point of copying
// MadMuscles' funnel is a hard paywall right after the quiz.
const ALWAYS_FREE_PATHS = ['/settings', '/messages', '/notifications', '/profile', '/banned', '/onboarding', '/goals'];

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
  // Active coaching is a higher-priced add-on tier, not an alternative to
  // membership — it grants at least everything a regular membership does.
  const hasMembership = profile?.membership?.status === 'active' || profile?.coaching?.status === 'active';

  const trialDays = config?.trialDays ?? 0;
  const inTrial = isInFreeTrial(config, profile?.createdAt);

  if (hasMembership || inTrial) return <>{children}</>;

  // Full lock — block everything except safe paths
  if (config.fullLock) {
    const freePaths = config.paidTrialEnabled ? ALWAYS_FREE_PATHS : [...ALWAYS_FREE_PATHS, '/dashboard'];
    const isFree = freePaths.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (!isFree) return <LockedScreen trialDays={trialDays} paidTrialEnabled={!!config.paidTrialEnabled} trialPriceCents={config.trialPriceCents} discountPercent={getActiveDiscountPercent(config)} alreadyUsedTrial={!!profile?.trialUsedAt} />;
  }

  return <>{children}</>;
}

function LockedScreen({ trialDays, paidTrialEnabled, trialPriceCents, discountPercent, alreadyUsedTrial }: { trialDays: number; paidTrialEnabled: boolean; trialPriceCents?: number; discountPercent: number; alreadyUsedTrial: boolean }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Record<string, PlanBillingPeriodMonths>>({});
  const trialPrice = ((trialPriceCents ?? 100) / 100).toFixed(2);
  // A user who already used their trial (free or paid) gets none of the
  // trial copy or CTAs a first-timer sees — trialUsedAt, set once by the
  // webhook the first time either kind fires, is the single source of
  // truth for that, same as everywhere else this trial state is checked.
  const effectiveTrialDays = alreadyUsedTrial ? 0 : trialDays;
  // Names the price the trial converts INTO, not just the trial price —
  // "$1.00 for 7 days" alone never said what happens on day 8, which is
  // both the most important number and the one a customer will dispute a
  // charge over. Priced off the same featured (first) plan the cards below
  // lead with; falls back to the bare trial line until plans have loaded.
  // Follows the same admin-set mostPopular flag the cards below use for
  // their badge, falling back to the first plan only when none is marked —
  // was hardcoded to plans[0] regardless of which plan is actually featured.
  const featuredPlan = plans.find((p) => p.mostPopular) ?? plans[0];
  const featuredPrice = featuredPlan ? getPlanBillingPeriods(featuredPlan)[0] : null;
  const afterTrial = featuredPrice
    ? ` then $${featuredPrice.price.toFixed(2)}${featuredPrice.months === 1 ? '/mo' : ` every ${featuredPrice.months} months`}`
    : '';
  const trialLabel = effectiveTrialDays <= 0 ? '' : paidTrialEnabled
    ? ` · $${trialPrice} for ${effectiveTrialDays} days,${afterTrial || ' then your plan price applies'}`
    : ` · ${effectiveTrialDays}-day free trial${afterTrial ? `,${afterTrial}` : ''}`;

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
          <p className="text-xs text-text-tertiary">Already a member? Contact support for access.</p>
        </Card>
      ) : (
        // Was a single narrow (max-w-sm) stacked column, and unlike the
        // landing page's own pricing cards, showed no feature list, no
        // "Most Popular" badge, and no discount strike-through — so a user
        // hitting this wall after signup had no way to see what they were
        // actually about to buy, and no way back to the landing page to
        // check. Mirrors the landing page's card content exactly; grid
        // (not a forced stack) so plans sit side by side once there's room.
        <div className={`grid gap-4 items-stretch w-full ${
          plans.length >= 3 ? 'max-w-4xl sm:grid-cols-2 lg:grid-cols-3' : plans.length === 2 ? 'max-w-2xl sm:grid-cols-2' : 'max-w-sm'
        }`}>
          {plans.map((plan, i) => {
            const periods = getPlanBillingPeriods(plan);
            const period = selectedPeriod[plan.id] ?? periods[0]?.months ?? 1;
            const active = periods.find((p) => p.months === period) ?? periods[0];
            // Same admin-set mostPopular flag the landing page uses, same
            // fallback-to-first-plan when nobody's explicitly chosen one.
            const isFeatured = plans.some((p) => p.mostPopular) ? !!plan.mostPopular : i === 0;
            return (
              <Card key={plan.id} className={`relative p-5 h-full flex flex-col ${isFeatured ? 'border-2 border-accent' : 'border-accent/20'}`}>
                {isFeatured && (
                  <div className="absolute -top-3 left-4 px-2.5 py-0.5 bg-accent rounded-full">
                    <span className="text-[10px] font-bold text-black uppercase tracking-wide">Most Popular</span>
                  </div>
                )}
                {discountPercent > 0 && (
                  <div className="absolute -top-3 right-4 px-2.5 py-0.5 bg-danger rounded-full">
                    <span className="text-[10px] font-bold text-white">{discountPercent}% OFF</span>
                  </div>
                )}
                <p className="text-sm font-bold text-white">{plan.name}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-2xl font-black text-white">${applyDiscount(active.price, discountPercent).toFixed(2)}</span>
                      <span className="text-sm text-text-tertiary line-through">${active.price.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-white">${active.price.toFixed(2)}</span>
                  )}
                  <span className="text-sm font-medium text-text-secondary">{active.months === 1 ? '/mo' : ` / ${active.months}mo`}</span>
                </div>
                {effectiveTrialDays > 0 && (
                  <p className="text-[11px] text-accent mt-1 font-medium">
                    {paidTrialEnabled ? `$${trialPrice} for ${effectiveTrialDays} days, then this price applies` : `${effectiveTrialDays}-day free trial, no payment required`}
                  </p>
                )}
                {plan.description && <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>}
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
                  <Button fullWidth onClick={() => handleSubscribe(plan.id)} loading={subscribingId === plan.id}>
                    <Crown className="w-4 h-4" /> {subscribingId === plan.id ? 'Opening Checkout…' : effectiveTrialDays <= 0 ? 'Subscribe Now' : paidTrialEnabled ? `Start for $${trialPrice}` : 'Start Free Trial'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
