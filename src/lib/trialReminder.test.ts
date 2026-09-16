import { describe, it, expect } from 'vitest';
import { formatMoney, cadenceLabel, describeUpcomingCharge, trialReminderSubject, formatChargeDate } from './trialReminder';

const DAY = 86_400_000;

describe('trialReminder — money and cadence', () => {
  it('drops .00 and keeps real pence', () => {
    expect(formatMoney(4900, 'gbp')).toBe('£49');
    expect(formatMoney(4950, 'gbp')).toBe('£49.50');
    expect(formatMoney(100, 'usd')).toBe('$1');
    expect(formatMoney(49900, 'gbp')).toBe('£499');
  });
  it('reads cadence from the recurring price', () => {
    expect(cadenceLabel('month', 1)).toBe('a month');
    expect(cadenceLabel('year', 1)).toBe('a year');
    expect(cadenceLabel('month', 3)).toBe('every 3 months');
    expect(cadenceLabel(null, null)).toBeNull();
  });
  it('formats the charge date in UTC so it cannot slip a day on the server', () => {
    expect(formatChargeDate(Date.UTC(2026, 8, 23, 0, 30) / 1000)).toBe('23 September 2026');
  });
});

describe('trialReminder — describeUpcomingCharge', () => {
  const now = Date.UTC(2026, 8, 20, 9, 0);
  const sub = {
    trial_end: Math.floor((now + 3 * DAY) / 1000),
    metadata: { userId: 'u1', planName: 'Vanguard' },
    items: { data: [{ price: { unit_amount: 4900, currency: 'gbp', recurring: { interval: 'month', interval_count: 1 } } }] },
  };

  it('states the exact amount, cadence, date, plan and days left', () => {
    expect(describeUpcomingCharge(sub, now)).toEqual({
      amountLabel: '£49', cadence: 'a month', chargeDate: '23 September 2026', daysLeft: 3, planName: 'Vanguard',
    });
  });

  it('puts the date and the money in the subject', () => {
    expect(trialReminderSubject(describeUpcomingCharge(sub, now)))
      .toBe('Your Vanguard trial ends 23 September 2026 — then £49 a month');
  });

  it('survives a subscription with no readable price rather than inventing a number', () => {
    const c = describeUpcomingCharge({ trial_end: sub.trial_end, metadata: { userId: 'u1' } }, now);
    expect(c.amountLabel).toBeNull();
    expect(c.cadence).toBeNull();
    expect(c.planName).toBe('membership');
    expect(trialReminderSubject(c)).toBe('Your membership trial ends 23 September 2026');
  });

  it('never says "0 days" — a reminder that arrives late still says today', () => {
    expect(describeUpcomingCharge(sub, now + 3 * DAY + 60_000).daysLeft).toBe(1);
  });

  it('falls back to the price nickname when checkout metadata is missing', () => {
    const c = describeUpcomingCharge({ ...sub, metadata: {}, items: { data: [{ price: { ...sub.items.data[0].price, nickname: 'Hero' } }] } }, now);
    expect(c.planName).toBe('Hero');
  });
});
