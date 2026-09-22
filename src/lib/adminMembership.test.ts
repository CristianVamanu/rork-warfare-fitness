import { describe, it, expect } from 'vitest';
import { planMembershipAction, isAdminMembershipAction } from './adminMembership';

const stripeMember = { status: 'active', stripeSubscriptionId: 'sub_123' };
const grantedMember = { status: 'active' };
const ending = { status: 'active', stripeSubscriptionId: 'sub_123', cancelAtPeriodEnd: true };

describe('cancel at period end', () => {
  it('tells Stripe to stop renewing and keeps access until then', () => {
    const r = planMembershipAction(stripeMember, 'cancel_at_period_end');
    expect(r.ok && r.plan.stripe).toBe('cancel_at_period_end');
    expect(r.ok && r.plan.set.status).toBe('active');
    expect(r.ok && r.plan.set.cancelAtPeriodEnd).toBe(true);
  });

  it('refuses an admin-granted membership rather than escalating to "now"', () => {
    // No Stripe period to end at. Turning the click into an immediate
    // revoke would be the opposite of what the admin chose.
    const r = planMembershipAction(grantedMember, 'cancel_at_period_end');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(409);
    expect(!r.ok && r.error).toMatch(/Cancel now/);
  });
});

describe('cancel now', () => {
  it('cancels the Stripe subscription and ends access', () => {
    const r = planMembershipAction(stripeMember, 'none');
    expect(r.ok && r.plan.stripe).toBe('cancel_now');
    expect(r.ok && r.plan.set.status).toBe('none');
    expect(r.ok && r.plan.clear).toContain('stripeSubscriptionId');
  });

  it('works on an admin-granted membership with nothing to tell Stripe', () => {
    const r = planMembershipAction(grantedMember, 'none');
    expect(r.ok && r.plan.stripe).toBeNull();
    expect(r.ok && r.plan.set.status).toBe('none');
  });
});

describe('grant / keep', () => {
  it('grants a plain membership without touching Stripe', () => {
    const r = planMembershipAction({ status: 'none' }, 'active');
    expect(r.ok && r.plan.stripe).toBeNull();
    expect(r.ok && r.plan.set.status).toBe('active');
    expect(r.ok && r.plan.audit).toBe('grant');
  });

  it('REVERSES a pending cancellation on Stripe — the "keep" case', () => {
    // Setting status alone left the subscription expiring at period end,
    // so a member the admin had just kept lost access weeks later.
    const r = planMembershipAction(ending, 'active');
    expect(r.ok && r.plan.stripe).toBe('resume');
    expect(r.ok && r.plan.clear).toContain('cancelAtPeriodEnd');
    expect(r.ok && r.plan.audit).toBe('keep');
  });

  it('does not call resume when nothing was pending', () => {
    const r = planMembershipAction(stripeMember, 'active');
    expect(r.ok && r.plan.stripe).toBeNull();
  });
});

describe('input guard', () => {
  it('accepts only the three actions', () => {
    expect(isAdminMembershipAction('active')).toBe(true);
    expect(isAdminMembershipAction('none')).toBe(true);
    expect(isAdminMembershipAction('cancel_at_period_end')).toBe(true);
    expect(isAdminMembershipAction('cancel')).toBe(false);
    expect(isAdminMembershipAction(undefined)).toBe(false);
  });
});
