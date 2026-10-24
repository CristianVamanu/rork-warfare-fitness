import { describe, it, expect } from 'vitest';
import {
  normalizePartnerCode, generatePartnerCode, normalizePartnerConfig, DEFAULT_PARTNER_CONFIG,
  effectivePercent, effectiveCapMonths, partnerCanEarn, canAttachCode, monthsBetween,
  computeCommission, computeClawback, derivedStatus, summarizeLedger, fraudFlags, partnerLinks,
  type LedgerRow,
} from './partners';

const cfg = normalizePartnerConfig(null);

describe('codes', () => {
  it('accepts handles and generated codes, upper-cased', () => {
    expect(normalizePartnerCode('coachmike')).toBe('COACHMIKE');
    expect(normalizePartnerCode(' ab12 ')).toBe('AB12');
    expect(normalizePartnerCode('ab')).toBeNull();
    expect(normalizePartnerCode('has space')).toBeNull();
    expect(normalizePartnerCode(42)).toBeNull();
  });
  it('generates codes that pass their own check', () => {
    for (let i = 0; i < 50; i++) expect(normalizePartnerCode(generatePartnerCode())).not.toBeNull();
  });
});

describe('config', () => {
  it('defaults and clamps', () => {
    expect(cfg).toEqual(DEFAULT_PARTNER_CONFIG);
    const c = normalizePartnerConfig({ defaultPercent: 150, holdDays: -3, payoutMode: 'manual', freeMembership: false, agreementText: '' });
    expect(c.defaultPercent).toBe(90);
    expect(c.holdDays).toBe(0);
    expect(c.payoutMode).toBe('manual');
    expect(c.freeMembership).toBe(false);
    expect(c.agreementText).toBe(DEFAULT_PARTNER_CONFIG.agreementText);
  });
  it('per-partner overrides win, nonsense falls back', () => {
    expect(effectivePercent({ percentOverride: 40 }, cfg)).toBe(40);
    expect(effectivePercent({ percentOverride: null }, cfg)).toBe(30);
    expect(effectivePercent({ percentOverride: 500 }, cfg)).toBe(30);
    expect(effectiveCapMonths({ capMonthsOverride: 12 }, cfg)).toBe(12);
    expect(effectiveCapMonths({}, cfg)).toBe(0);
  });
  it('only active partners earn', () => {
    expect(partnerCanEarn({ status: 'active' })).toBe(true);
    expect(partnerCanEarn({ status: 'applied' })).toBe(false);
    expect(partnerCanEarn({ status: 'suspended' })).toBe(false);
    expect(partnerCanEarn(null)).toBe(false);
  });
});

describe('attribution', () => {
  it('locks are final and paid members cannot be attributed later', () => {
    expect(canAttachCode(null, false)).toBe(true);
    expect(canAttachCode({ pendingCode: 'A' }, false)).toBe(true);
    expect(canAttachCode({ partnerId: 'p' }, false)).toBe(false);
    expect(canAttachCode({ lockedAt: new Date() }, false)).toBe(false);
    expect(canAttachCode(null, true)).toBe(false);
  });
  it('counts whole months for the cap', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0);
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1);
    expect(monthsBetween(new Date('2026-01-15'), new Date('2027-01-20'))).toBe(12);
  });
});

describe('commission', () => {
  it('is a share of net, never of a free invoice', () => {
    expect(computeCommission({ amountPaidCents: 2999, feeCents: 117, percent: 30 })).toEqual({ netCents: 2882, commissionCents: 865 });
    expect(computeCommission({ amountPaidCents: 0, feeCents: 0, percent: 30 })).toEqual({ netCents: 0, commissionCents: 0 });
    expect(computeCommission({ amountPaidCents: 1000, feeCents: 5000, percent: 30 })).toEqual({ netCents: 0, commissionCents: 0 });
    expect(computeCommission({ amountPaidCents: 1000, feeCents: 0, percent: 40 }).commissionCents).toBe(400);
  });
  it('claws back the same share that was earned', () => {
    const row = { grossCents: 2999, commissionCents: 865 };
    expect(computeClawback(row, 2999)).toBe(-865);
    expect(computeClawback(row, 1500)).toBe(-433);
    expect(computeClawback(row, 99999)).toBe(-865);
    expect(computeClawback({ grossCents: 0, commissionCents: 0 }, 100)).toBe(0);
  });
});

describe('ledger status and balance', () => {
  const now = new Date('2026-03-01T00:00:00Z');
  const row = (over: Partial<LedgerRow>): LedgerRow => ({
    id: 'in_1', partnerId: 'p', partnerCode: 'C', memberUid: 'm', invoiceId: 'in_1', grossCents: 1000, feeCents: 0, netCents: 1000,
    percent: 30, commissionCents: 300, currency: 'usd', status: 'pending', flags: [], holdUntil: new Date('2026-02-01'), ...over,
  });
  it('pending becomes approved once the hold passes, review while flagged', () => {
    expect(derivedStatus(row({}), now)).toBe('approved');
    expect(derivedStatus(row({ holdUntil: new Date('2026-04-01') }), now)).toBe('pending');
    expect(derivedStatus(row({ flags: ['shared_card'] }), now)).toBe('review');
    expect(derivedStatus(row({ status: 'rejected', flags: ['x'] }), now)).toBe('rejected');
    expect(derivedStatus(row({ status: 'paid' }), now)).toBe('paid');
  });
  it('sums into a balance where unpaid clawbacks reduce what is payable', () => {
    const b = summarizeLedger([
      row({ id: 'a' }),                                              // approved 300
      row({ id: 'b', holdUntil: new Date('2026-04-01') }),           // pending 300
      row({ id: 'c', status: 'paid', payoutId: 'po1' }),             // paid 300
      row({ id: 'd', status: 'clawback', commissionCents: -100 }),   // unpaid clawback
      row({ id: 'e', status: 'clawback', commissionCents: -50, payoutId: 'po1' }), // already settled
      row({ id: 'f', flags: ['velocity'] }),                         // review 300
    ], now);
    expect(b.approvedCents).toBe(300);
    expect(b.pendingCents).toBe(300);
    expect(b.paidCents).toBe(300);
    expect(b.reviewCents).toBe(300);
    expect(b.clawbackCents).toBe(-150);
    expect(b.payableCents).toBe(200);
  });
});

describe('fraud flags', () => {
  const base = { memberUid: 'm1', partnerUid: 'p1' };
  it('is empty for a clean referral', () => {
    expect(fraudFlags({ ...base, memberEmail: 'a@x.com', partnerEmail: 'b@y.com', cardFingerprint: 'f1' })).toEqual([]);
  });
  it('catches self and alias emails, shared cards and velocity', () => {
    expect(fraudFlags({ ...base, memberUid: 'p1' })).toContain('self_referral');
    expect(fraudFlags({ ...base, memberEmail: 'Mike@x.com', partnerEmail: 'mike@x.com' })).toContain('same_email');
    expect(fraudFlags({ ...base, memberEmail: 'mi.ke+gym@x.com', partnerEmail: 'mike@x.com' })).toContain('email_alias');
    expect(fraudFlags({ ...base, memberName: 'Mike Jones', partnerName: 'mike jones' })).toContain('same_name');
    expect(fraudFlags({ ...base, cardFingerprint: 'f1', partnerOwnFingerprints: ['f1'] })).toContain('partner_card');
    expect(fraudFlags({ ...base, cardFingerprint: 'f1', partnerMemberFingerprints: { f1: 'm2' } })).toContain('shared_card');
    expect(fraudFlags({ ...base, cardFingerprint: 'f1', partnerMemberFingerprints: { f1: 'm1' } })).not.toContain('shared_card');
    expect(fraudFlags({ ...base, locksLast24h: 5 })).toContain('velocity');
  });
});

describe('links', () => {
  it('builds the share link from the app url', () => {
    expect(partnerLinks('https://warfarefitness.com/', 'MIKE')).toEqual({ link: 'https://warfarefitness.com/p/MIKE', short: 'warfarefitness.com/p/MIKE' });
  });
});
