import { describe, it, expect } from 'vitest';
import {
  describeCheckoutOffer, checkoutRecoveryDue, checkoutRecoveryStep, checkoutRecoverySubject,
  RECOVERY_DELAY_MS, RECOVERY_FOLLOWUP_DELAY_MS, RECOVERY_MAX_AGE_MS,
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

describe('checkoutRecovery — the 48-hour follow-up', () => {
  const now = 1_800_000_000_000;
  const started = new Date(now - RECOVERY_FOLLOWUP_DELAY_MS - 60_000);
  const base = {
    email: 'a@b.c',
    checkoutIntent: { planId: 'vanguard', planName: 'Vanguard', months: 1, amountLabel: '$49 a month', trialLabel: '7 days for $1', startedAt: started },
    checkoutRecoveryEmailSentAt: new Date(started.getTime() + RECOVERY_DELAY_MS),
  };

  it('is owed once 48h have passed and the first went out', () => {
    expect(checkoutRecoveryStep(base, now)).toBe('followup');
  });

  it('is sent once, then silence', () => {
    expect(checkoutRecoveryStep({ ...base, checkoutRecoveryFollowupSentAt: new Date(now - 1000) }, now)).toBe(null);
  });

  it('before 48h it is the first email that is owed, not both', () => {
    const early = { ...base, checkoutIntent: { ...base.checkoutIntent, startedAt: new Date(now - 4 * H) }, checkoutRecoveryEmailSentAt: undefined };
    expect(checkoutRecoveryStep(early, now)).toBe('first');
    expect(checkoutRecoveryStep({ ...early, checkoutRecoveryEmailSentAt: new Date(now - H) }, now)).toBe(null);
  });

  it('if the first was never sent and 48h have passed, only the follow-up goes', () => {
    expect(checkoutRecoveryStep({ ...base, checkoutRecoveryEmailSentAt: undefined }, now)).toBe('followup');
  });

  it('a paid member never gets it, whenever they paid', () => {
    expect(checkoutRecoveryStep({ ...base, membership: { status: 'active' } }, now)).toBe(null);
  });

  it('a fresh checkout start restarts the sequence', () => {
    const restarted = {
      ...base,
      checkoutRecoveryFollowupSentAt: new Date(now - 2 * H),
      checkoutIntent: { ...base.checkoutIntent, startedAt: new Date(now - 4 * H) },
    };
    expect(checkoutRecoveryStep(restarted, now)).toBe('first');
  });
});

describe('checkoutRecovery — subjects', () => {
  it('name the plan, differently per step', () => {
    expect(checkoutRecoverySubject('Vanguard')).toBe('Your Vanguard plan is still waiting');
    expect(checkoutRecoverySubject('Vanguard', 'followup')).toBe('Still thinking about Vanguard?');
  });
});
