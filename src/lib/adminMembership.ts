/**
 * What an admin's membership action means for Stripe and for Firestore.
 *
 * Pure on purpose: this is billing, and billing logic that lives inline in
 * a route is the kind that gets one edge case wrong for a year without
 * anyone noticing. Every branch here is asserted in adminMembership.test.ts.
 *
 * Three actions:
 *
 *   'cancel_at_period_end' — the graceful one. Stripe stops renewing; the
 *     member keeps everything they paid for until the period ends, then the
 *     customer.subscription.deleted webhook drops them to 'none'. Nothing to
 *     refund, nothing to argue about. Requires a Stripe subscription: an
 *     admin-granted membership has no period to end at, and quietly turning
 *     "at period end" into "now" for those would be the admin doing the
 *     opposite of what they clicked. That case is refused with a message.
 *
 *   'none' — now. The Stripe subscription is cancelled immediately and
 *     access ends. The route tolerates a subscription already cancelled on
 *     Stripe's side; the Firestore status still has to move.
 *
 *   'active' — grant, or KEEP. If a period-end cancellation is pending, this
 *     reverses it on Stripe too. Previously it only set the status, so the
 *     subscription still expired at period end and the member the admin had
 *     just "kept" lost access a few weeks later with nothing in the logs.
 */

export type AdminMembershipAction = 'active' | 'none' | 'cancel_at_period_end';

export interface MembershipState {
  status?: string;
  stripeSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface MembershipPlan {
  /** What to ask Stripe to do, if anything. */
  stripe: 'cancel_now' | 'cancel_at_period_end' | 'resume' | null;
  /** Fields to set on users/{uid}.membership. Timestamps are named, not valued. */
  set: Record<string, unknown>;
  /** Fields to delete from users/{uid}.membership. */
  clear: string[];
  /** For the audit row. */
  audit: string;
}

export type PlanResult = { ok: true; plan: MembershipPlan } | { ok: false; status: number; error: string };

export const isAdminMembershipAction = (v: unknown): v is AdminMembershipAction =>
  v === 'active' || v === 'none' || v === 'cancel_at_period_end';

export function planMembershipAction(state: MembershipState, action: AdminMembershipAction): PlanResult {
  const subId = state.stripeSubscriptionId;

  if (action === 'cancel_at_period_end') {
    if (!subId) {
      return {
        ok: false,
        status: 409,
        error: 'This membership was granted by an admin and has no billing period to end at. Use "Cancel now" instead.',
      };
    }
    return {
      ok: true,
      plan: {
        stripe: 'cancel_at_period_end',
        set: { status: 'active', cancelAtPeriodEnd: true, cancelledByAdminAt: 'serverTimestamp' },
        clear: [],
        audit: 'cancel_at_period_end',
      },
    };
  }

  if (action === 'none') {
    return {
      ok: true,
      plan: {
        stripe: subId ? 'cancel_now' : null,
        set: { status: 'none', grantedAt: 'serverTimestamp' },
        clear: ['stripeSubscriptionId', 'cancelAtPeriodEnd', 'cancelledByAdminAt'],
        audit: 'cancel_now',
      },
    };
  }

  // 'active': grant — or keep, if a cancellation is pending.
  const resuming = !!subId && state.cancelAtPeriodEnd === true;
  return {
    ok: true,
    plan: {
      stripe: resuming ? 'resume' : null,
      set: { status: 'active', grantedAt: 'serverTimestamp' },
      clear: ['cancelAtPeriodEnd', 'cancelledByAdminAt'],
      audit: resuming ? 'keep' : 'grant',
    },
  };
}
