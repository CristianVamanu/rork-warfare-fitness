'use client';

import { useEffect, useState } from 'react';
import { getMembershipConfig, getMembershipPlans } from './firestore';
import { useAuth } from '@/contexts/AuthContext';
import { isInFreeTrial } from './membership';
import type { MembershipConfig, MembershipPlan } from '@/types';

export interface FeatureAccess {
  loaded: boolean;
  config: MembershipConfig | null;
  plans: MembershipPlan[];
  hasMembership: boolean;
  inTrial: boolean;
  /** Would a paywall normally show for this feature/program, ignoring taste. */
  isLocked: boolean;
  /** True once this feature's one-time free taste has already been used. */
  tasted: boolean;
  /**
   * True when a non-member/non-trial user is looking at a locked feature
   * they haven't tasted yet — content should render, and the caller should
   * call consumeAiTaste(user.uid, feature) after an actual successful
   * result (not just for opening the page).
   */
  tasteAvailable: boolean;
}

/**
 * Shared by PaywallGate (which feature this same taste-then-paywall logic
 * for the wall itself) and each locked AI tool's own page (which needs to
 * know when to spend the free taste on a successful result). Keeping this
 * in one hook means both stay in sync automatically — the page's write to
 * aiTaste flows back through useAuth()'s live profile listener, so
 * PaywallGate re-evaluates on its own without any direct coordination.
 */
export function useFeatureAccess(feature?: string, programId?: string): FeatureAccess {
  const { profile } = useAuth();
  const [config, setConfig] = useState<MembershipConfig | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getMembershipConfig().catch(() => null),
      getMembershipPlans().catch(() => []),
    ])
      .then(([cfg, mp]) => { setConfig(cfg); setPlans(mp); })
      .finally(() => setLoaded(true));
  }, []);

  const hasMembership = profile?.membership?.status === 'active' || profile?.coaching?.status === 'active';

  const inTrial = isInFreeTrial(config, profile?.createdAt);

  // Admins/trainers always bypass — same exception MembershipGuard already
  // makes for the full-app paywall. Without this, an admin previewing a
  // feature they haven't personally subscribed to (they manage the
  // platform, they don't buy their own plans) hits the same "Members Only"
  // wall a real non-member would, with no way through it.
  const isStaff = profile?.role === 'admin' || profile?.role === 'trainer';

  let isLocked = false;
  if (!isStaff && config && config.enabled && !inTrial) {
    if (hasMembership) {
      const activePlan = profile?.membership?.planId
        ? plans.find((p) => p.id === profile.membership!.planId) ?? null
        : null;
      const planRestricts = !!activePlan?.featureAccess && activePlan.featureAccess.length > 0;
      if (planRestricts) {
        const featureAllowed = !feature || activePlan!.featureAccess.includes(feature);
        const programAllowed = !programId || activePlan!.featureAccess.includes('premium-programs');
        isLocked = !(featureAllowed && programAllowed);
      }
    } else {
      isLocked =
        !!config.fullLock ||
        (!!feature && (config.lockedFeatures ?? []).includes(feature)) ||
        (!!programId && (config.lockedProgramIds ?? []).includes(programId));
    }
  }

  const tasted = !!(feature && profile?.aiTaste?.[feature]);
  const tasteAvailable = isLocked && !hasMembership && !!feature && !tasted;

  return { loaded, config, plans, hasMembership, inTrial, isLocked, tasted, tasteAvailable };
}
