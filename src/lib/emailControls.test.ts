import { describe, it, expect } from 'vitest';
import { emailKindAllowed, sendHourOf, parseFromAddress, resolveEmailProvider, EMAIL_KINDS } from './emailControls';

describe('emailKindAllowed', () => {
  it('sends everything with no controls saved', () => {
    for (const k of EMAIL_KINDS) expect(emailKindAllowed(null, k.kind)).toBe(true);
  });
  it('a switched-off kind does not send', () => {
    expect(emailKindAllowed({ kinds: { welcome: false } }, 'welcome')).toBe(false);
    expect(emailKindAllowed({ kinds: { welcome: false } }, 'achievement')).toBe(true);
  });
  it('never blocks the required kind, even when told to', () => {
    expect(emailKindAllowed({ kinds: { auth: false }, pauseMarketing: true }, 'auth')).toBe(true);
  });
  it('pause marketing stops marketing only', () => {
    const c = { pauseMarketing: true };
    expect(emailKindAllowed(c, 'sequence')).toBe(false);
    expect(emailKindAllowed(c, 'broadcast')).toBe(false);
    expect(emailKindAllowed(c, 'paymentFailed')).toBe(true);
    expect(emailKindAllowed(c, 'welcome')).toBe(true);
  });
});

describe('sendHourOf', () => {
  it('defaults to 8 and rejects nonsense', () => {
    expect(sendHourOf(null)).toBe(8);
    expect(sendHourOf({ sendHour: 19 })).toBe(19);
    expect(sendHourOf({ sendHour: 25 })).toBe(8);
    expect(sendHourOf({ sendHour: 7.5 })).toBe(8);
  });
});

describe('provider helpers', () => {
  it('splits a display-name address and passes a bare one through', () => {
    expect(parseFromAddress('Warfare Fitness <hi@warfare.com>')).toEqual({ name: 'Warfare Fitness', email: 'hi@warfare.com' });
    expect(parseFromAddress('hi@warfare.com')).toEqual({ name: '', email: 'hi@warfare.com' });
  });
  it('falls back to resend for anything unknown', () => {
    expect(resolveEmailProvider('brevo')).toBe('brevo');
    expect(resolveEmailProvider('sendgrid')).toBe('resend');
    expect(resolveEmailProvider(undefined)).toBe('resend');
  });
});
