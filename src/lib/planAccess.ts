import type { MembershipPlan } from '@/types';

/**
 * What a paying member's plan does and does not cover.
 *
 * Lives in its own module, with no React import, for the same reason
 * orgAiLimit.ts does: the hook that uses it pulls in AuthContext, and
 * anything importing that drags a .tsx (and Firebase client init) behind it.
 * This is the part worth testing, so it must be importable on its own.
 *
 * Getting it wrong costs money in both directions: too strict locks a paying
 * member out of the training they just bought, too loose gives the whole
 * library away on the entry tier.
 *
 * The rule that carries the tiering: A MEMBER'S OWN ASSIGNED PROGRAM IS
 * NEVER LOCKED BY THEIR PLAN. Every program in the catalogue is flagged
 * premium, so without that exception a plan omitting 'premium-programs'
 * would lock someone out of the one program onboarding just put them in —
 * they would pay and immediately hit a paywall on their own workout.
 * Switching to a DIFFERENT program still needs the entitlement, and that is
 * the line the upgrade is sold on.
 *
 * An empty featureAccess list means the plan restricts nothing.
 */
import { pruneFeatureAccess } from './gatedFeatures';

export function resolvePlanLock(
  plan: MembershipPlan | null,
  feature: string | undefined,
  programId: string | undefined,
  ownProgramId: string | undefined,
): { isLocked: boolean; otherProgramsLocked: boolean } {
  // Pruned at read as well as at save: a plan last saved before an id was
  // retired still carries it, and an allowlist holding only dead ids would
  // lock a paying member out of everything until an admin happened to
  // re-save that plan.
  const access = pruneFeatureAccess(plan?.featureAccess);
  const restricts = access.length > 0;
  if (!restricts) return { isLocked: false, otherProgramsLocked: false };

  const coversLibrary = access.includes('premium-programs');
  const featureAllowed = !feature || access.includes(feature);
  const isOwnProgram = !!programId && !!ownProgramId && programId === ownProgramId;
  const programAllowed = !programId || isOwnProgram || coversLibrary;

  return {
    isLocked: !(featureAllowed && programAllowed),
    otherProgramsLocked: !coversLibrary,
  };
}
