import { describe, it, expect } from 'vitest';
import { membershipChangeFor } from './revenuecat';

describe('membershipChangeFor', () => {
  const base = { app_user_id: 'uid1', product_id: 'wf_monthly', expiration_at_ms: 1_800_000_000_000, event_timestamp_ms: 1_700_000_000_500, entitlement_ids: ['premium'] };
  it('grants on purchase and renewal, with the store expiry', () => {
    const c = membershipChangeFor({ ...base, type: 'INITIAL_PURCHASE' }, 'premium');
    expect(c).toMatchObject({ kind: 'grant', uid: 'uid1', cancelAtPeriodEnd: false, eventCreated: 1_700_000_000 });
    expect(c.kind === 'grant' && c.expiresAt?.getTime()).toBe(1_800_000_000_000);
    expect(membershipChangeFor({ ...base, type: 'RENEWAL' }, 'premium').kind).toBe('grant');
  });
  it('keeps access to period end on cancellation, removes it on expiration', () => {
    expect(membershipChangeFor({ ...base, type: 'CANCELLATION' }, 'premium')).toMatchObject({ kind: 'grant', cancelAtPeriodEnd: true });
    expect(membershipChangeFor({ ...base, type: 'EXPIRATION' }, 'premium')).toMatchObject({ kind: 'revoke', uid: 'uid1' });
  });
  it('ignores anonymous users, test events and other entitlements', () => {
    expect(membershipChangeFor({ ...base, type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc' }, 'premium').kind).toBe('ignore');
    expect(membershipChangeFor({ ...base, type: 'TEST' }, 'premium').kind).toBe('ignore');
    expect(membershipChangeFor({ ...base, type: 'INITIAL_PURCHASE', entitlement_ids: ['other'] }, 'premium').kind).toBe('ignore');
    expect(membershipChangeFor({ ...base, type: 'BILLING_ISSUE' }, 'premium').kind).toBe('ignore');
  });
});
