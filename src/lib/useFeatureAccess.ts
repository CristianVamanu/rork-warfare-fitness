'use client';

import { useEffect, useState } from 'react';
import { getMembershipConfig, getMembershipPlans } from './firestore';
import { useAuth } from '@/contexts/AuthContext';
import { isInFreeTrial, hasActiveSubscription } from './membership';
import type { MembershipConfig, MembershipPlan } from '@/types';
import { resolvePlanLock } from './planAccess';
import { programSwitchesLeft } from './membership';

export interface FeatureAccess {
  loaded: boolean;
  config: MembershipConfig | null;
  plans: MembershipPlan[];
  hasMembership: boolean;
  inTrial: boolean;
  /** Would a paywall normally show for this feature/program, ignoring taste. */
  isLocked: boolean;
  /**
   * Program changes this member still has before a switch needs the library
   * entitlement. Counts down from PROGRAM_SWITCH_ALLOWANCE; the rules are the
   * enforcement, this is what the UI shows.
   */
  switchesLeft: number;
  /**
   * True when this program is reachable ONLY because of a remaining switch.
   * The enrol call passes it through so the switch is spent on the same write
   * that changes the program, which is the only shape the rules accept.
   */
  switchNeeded: boolean;
  /**
   * True when this member's plan covers their own assigned program but not
   * the rest of the library — the entry-tier state. Answered once for a
   * whole list, since a hook cannot be called per row.
   */
  otherProgramsLocked: boolean;
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

  const hasMembership = hasActiveSubscription(profile);

  const inTrial = isInFreeTrial(config, profile?.createdAt);

  // Admins/trainers always bypass — same exception MembershipGuard already
  // makes for the full-app paywall. Without this, an admin previewing a
  // feature they haven't personally subscribed to (they manage the
  // platform, they don't buy their own plans) hits the same "Members Only"
  // wall a real non-member would, with no way through it.
  const isStaff = profile?.role === 'admin' || profile?.role === 'trainer';

  const switchesLeft = programSwitchesLeft(profile?.programSwitchesUsed);
  let isLocked = false;
  let otherProgramsLocked = false;
  let switchNeeded = false;
  if (!isStaff && config && config.enabled && !inTrial) {
    if (hasMembership) {
      const activePlan = profile?.membership?.planId
        ? plans.find((p) => p.id === profile.membership!.planId) ?? null
        : null;
      const verdict = resolvePlanLock(activePlan, feature, programId, profile?.activeProgram?.programId);
      isLocked = verdict.isLocked;
      otherProgramsLocked = verdict.otherProgramsLocked;
      // A paying member with switches left can move to any program, so the
      // program is not locked to them — the cost is one of their switches,
      // not an upgrade. Only ever applies to a PROGRAM lock: an allowance
      // buys you a different program, never a tool the plan excludes.
      if (isLocked && !feature && programId && switchesLeft > 0) {
        isLocked = false;
        otherProgramsLocked = false;
        switchNeeded = true;
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

  return { loaded, config, plans, hasMembership, inTrial, isLocked, otherProgramsLocked, tasted, tasteAvailable, switchesLeft, switchNeeded };
}
