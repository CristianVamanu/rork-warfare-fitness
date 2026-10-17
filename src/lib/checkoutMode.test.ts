import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// Vitest runs these in Node, where there is no sessionStorage. A tiny
// in-memory stand-in with the same three calls the module uses.
beforeAll(() => {
  if (typeof globalThis.sessionStorage === 'undefined') {
    const m = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
        removeItem: (k: string) => { m.delete(k); },
        clear: () => { m.clear(); },
      },
      configurable: true,
    });
  }
});
import {
  checkoutPagePath, parseCheckoutParams, checkoutReturnParams,
  isSafeResumePath, rememberCheckoutIntent, consumeCheckoutIntent,
} from './checkoutMode';

describe('checkoutMode — the on-site checkout page', () => {
  it('builds the page path every subscribe button now points at', () => {
    expect(checkoutPagePath('vanguard', 1)).toBe('/checkout?plan=vanguard&months=1');
    expect(checkoutPagePath('hero', 12)).toBe('/checkout?plan=hero&months=12');
    expect(checkoutPagePath('a b', 3)).toBe('/checkout?plan=a+b&months=3');
  });

  it('reads its params back and never throws on garbage', () => {
    const get = (m: Record<string, string>) => (k: string) => m[k] ?? null;
    expect(parseCheckoutParams(get({ plan: 'hero', months: '12' }))).toEqual({ planId: 'hero', months: 12 });
    expect(parseCheckoutParams(get({ plan: 'hero', months: '7' }))).toEqual({ planId: 'hero', months: 1 });
    expect(parseCheckoutParams(get({ plan: '  ', months: 'x' }))).toEqual({ planId: null, months: 1 });
    expect(parseCheckoutParams(get({}))).toEqual({ planId: null, months: 1 });
  });
});

describe('checkoutMode — Stripe session return fields', () => {
  it('embedded sessions get a single return_url with the session-id placeholder', () => {
    expect(checkoutReturnParams({ embedded: true, appUrl: 'https://warfarefitness.com/' })).toEqual({
      ui_mode: 'embedded',
      return_url: 'https://warfarefitness.com/checkout/complete?session_id={CHECKOUT_SESSION_ID}',
    });
  });

  it('hosted sessions keep the old success and cancel URLs exactly', () => {
    expect(checkoutReturnParams({ embedded: false, appUrl: 'https://warfarefitness.com' })).toEqual({
      success_url: 'https://warfarefitness.com/dashboard?subscribed=1',
      cancel_url: 'https://warfarefitness.com/profile',
    });
  });
});

describe('checkoutMode — resume after login', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('remembers a checkout and hands it back exactly once', () => {
    rememberCheckoutIntent('/checkout?plan=vanguard&months=1');
    expect(consumeCheckoutIntent()).toBe('/checkout?plan=vanguard&months=1');
    expect(consumeCheckoutIntent()).toBeNull();
  });

  it('refuses anything that is not our own checkout or dashboard — no open redirect via login', () => {
    for (const bad of ['https://evil.example/x', '//evil.example', '/profile', '/checkoutx', 'checkout?plan=a', '']) {
      expect(isSafeResumePath(bad)).toBe(false);
      rememberCheckoutIntent(bad);
      expect(consumeCheckoutIntent()).toBeNull();
    }
    expect(isSafeResumePath('/checkout?plan=a&months=1')).toBe(true);
    expect(isSafeResumePath('/dashboard?subscribed=1')).toBe(true);
    expect(isSafeResumePath('/checkout/complete?session_id=cs_x')).toBe(true);
  });
});
