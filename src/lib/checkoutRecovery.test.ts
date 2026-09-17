import { describe, it, expect } from 'vitest';
import {
  describeCheckoutOffer, checkoutRecoveryDue, checkoutRecoverySubject,
  RECOVERY_DELAY_MS, RECOVERY_MAX_AGE_MS,
} from './checkoutRecovery';

const H = 60 * 60 * 1000;

describe('checkoutRecovery — describing the offer', () => {
  it('monthly plan with a paid trial', () => {
    expect(describeCheckoutOffer({ planName: 'Vanguard', totalPrice: 49, currency: 'usd', months: 1, trialDays: 7, trialPriceCents: 100 }))
      .toEqual({ amountLabel: '$49 a month', trialLabel: '7 days for $1' });
  });
  it('yearly plan, no trial', () => {
    expect(describeCheckoutOffer({ planName: 'Hero', totalPrice: 490, currency: 'usd', months: 12, trialDays: 0, trialPriceCents: 100 }))
      .toEqual({ amountLabel: '$490 a year', trialLabel: null });
  });
  it('multi-month term and pence kept when real', () => {
    expect(describeCheckoutOffer({ planName: 'X', totalPrice: 99.5, currency: 'gbp', months: 3, trialDays: 7, trialPriceCents: null }))
      .toEqual({ amountLabel: '£99.50 every 3 months', trialLabel: null });
  });
});

describe('checkoutRecovery — when to send', () => {
  const now = 1_800_000_000_000;
  const base = {
    email: 'a@b.c',
    checkoutIntent: { planId: 'vanguard', planName: 'Vanguard', months: 1, amountLabel: '$49 a month', trialLabel: '7 days for $1', startedAt: new Date(now - 4 * H) },
  };

  it('sends once the delay has passed and nothing else says no', () => {
    expect(checkoutRecoveryDue(base, now)).toBe(true);
  });

  it('waits out the delay — they may still be on the page or waiting on the webhook', () => {
    expect(checkoutRecoveryDue({ ...base, checkoutIntent: { ...base.checkoutIntent, startedAt: new Date(now - RECOVERY_DELAY_MS + 1000) } }, now)).toBe(false);
  });

  it('stays quiet once the moment has passed', () => {
    expect(checkoutRecoveryDue({ ...base, checkoutIntent: { ...base.checkoutIntent, startedAt: new Date(now - RECOVERY_MAX_AGE_MS - 1000) } }, now)).toBe(false);
  });

  it('never emails someone who paid, in either subscription', () => {
    expect(checkoutRecoveryDue({ ...base, membership: { status: 'active' } }, now)).toBe(false);
    expect(checkoutRecoveryDue({ ...base, coaching: { status: 'active' } }, now)).toBe(false);
  });

  it('one email per checkout start, but a fresh start can earn another', () => {
    const sentAfter = { ...base, checkoutRecoveryEmailSentAt: new Date(now - 3 * H) };
    expect(checkoutRecoveryDue(sentAfter, now)).toBe(false);
    const restarted = { ...sentAfter, checkoutIntent: { ...base.checkoutIntent, startedAt: new Date(now - 3 * H + 60_000) } };
    // Started after the last send, but only 3h - 1min ago: still inside the delay.
    expect(checkoutRecoveryDue(restarted, now)).toBe(false);
    expect(checkoutRecoveryDue(restarted, now + 2 * 60_000)).toBe(true);
  });

  it('skips staff, banned accounts, missing email and missing or malformed intents', () => {
    expect(checkoutRecoveryDue({ ...base, role: 'admin' }, now)).toBe(false);
    expect(checkoutRecoveryDue({ ...base, banned: true }, now)).toBe(false);
    expect(checkoutRecoveryDue({ ...base, email: null }, now)).toBe(false);
    expect(checkoutRecoveryDue({ email: 'a@b.c' }, now)).toBe(false);
    expect(checkoutRecoveryDue({ email: 'a@b.c', checkoutIntent: { planId: 'x' } }, now)).toBe(false);
    expect(checkoutRecoveryDue({ ...base, checkoutIntent: { ...base.checkoutIntent, startedAt: 'yesterday' } }, now)).toBe(false);
  });

  it('accepts Firestore-shaped timestamps', () => {
    const ts = { toMillis: () => now - 4 * H };
    expect(checkoutRecoveryDue({ ...base, checkoutIntent: { ...base.checkoutIntent, startedAt: ts } }, now)).toBe(true);
  });
});

describe('checkoutRecovery — subject', () => {
  it('names the plan', () => {
    expect(checkoutRecoverySubject('Vanguard')).toBe('Your Vanguard plan is still waiting');
  });
});
