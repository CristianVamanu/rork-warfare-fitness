import { getAdminDb } from '@/lib/firebase-admin';
import type { App } from 'firebase-admin/app';

/**
 * Server-side mirror of src/lib/useFeatureAccess.ts's isLocked logic.
 *
 * The client-side PaywallGate/useFeatureAccess check is UI-only — it hides
 * the button, but every AI endpoint (analyze-food, chat, meal-ideas,
 * scan-and-go, recommend-program) only ever checked "is this a real logged-in
 * user" + a daily rate limit, never "does their plan actually include this
 * feature." A non-member (or a member on a plan that doesn't include this
 * tool) with nothing but a valid Firebase ID token could call these routes
 * directly and get paid AI features free, on this app's OpenAI bill. This
 * closes that gap by re-checking the same membership/trial/plan rules
 * server-side before any OpenAI call is made.
 */
export async function verifyFeatureAccess(
  app: App,
  uid: string,
  feature: string
): Promise<{ allowed: true } | { allowed: false; error: string; status: number }> {
  const db = getAdminDb(app);

  const userSnap = await db.collection('users').doc(uid).get();
  const profile = userSnap.data() ?? {};

  // Admins/trainers manage the platform, they don't subscribe to their own
  // plans — same exception MembershipGuard/useFeatureAccess already make.
  if (profile.role === 'admin' || profile.role === 'trainer') return { allowed: true };

  const configSnap = await db.collection('config').doc('membership').get();
  const config = configSnap.data() as { enabled?: boolean; trialDays?: number; fullLock?: boolean; lockedFeatures?: string[] } | undefined;

  // Membership gating disabled entirely — every feature is free.
  if (!config || !config.enabled) return { allowed: true };

  const trialDays = config.trialDays ?? 0;
  const inTrial = (() => {
    if (!trialDays || !profile.createdAt) return false;
    const created = profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt);
    return Date.now() - created.getTime() < trialDays * 24 * 60 * 60 * 1000;
  })();
  if (inTrial) return { allowed: true };

  const hasMembership = profile.membership?.status === 'active' || profile.coaching?.status === 'active';

  if (hasMembership) {
    const membershipPlanId = profile.membership?.status === 'active' ? profile.membership?.planId : undefined;
    if (membershipPlanId) {
      const plansSnap = await db.collection('config').doc('membershipPlans').get();
      const plans = (plansSnap.data()?.plans ?? []) as { id: string; featureAccess?: string[] }[];
      const activePlan = plans.find((p) => p.id === membershipPlanId);
      const restricted = !!activePlan?.featureAccess?.length;
      if (restricted && !activePlan!.featureAccess!.includes(feature)) {
        return { allowed: false, error: `This feature isn't included in your current plan.`, status: 403 };
      }
    }
    return { allowed: true };
  }

  // Non-member: locked only if fullLock or this specific feature is in the
  // globally-locked list — same as the client. The one-time "taste" grace
  // period (a non-member's first real use of a locked AI tool) is honored
  // here too: if they haven't tasted this feature yet, let it through, same
  // as the client would show it once.
  const isLocked = !!config.fullLock || (config.lockedFeatures ?? []).includes(feature);
  if (!isLocked) return { allowed: true };

  const tasted = !!profile.aiTaste?.[feature];
  if (!tasted) return { allowed: true };

  return { allowed: false, error: 'This feature requires an active membership.', status: 403 };
}
