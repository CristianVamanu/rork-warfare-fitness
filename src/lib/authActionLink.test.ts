import { describe, it, expect } from 'vitest';
import { toOwnAuthActionLink } from './authActionLink';

const APP = 'https://warfarefitness.com';

// A real link shape, as generatePasswordResetLink returns it.
const fbReset =
  'https://warfare-fitness.firebaseapp.com/__/auth/action' +
  '?mode=resetPassword&oobCode=ABC-123_xyz&apiKey=AIzaSyFAKEKEY' +
  '&continueUrl=https%3A%2F%2Fwarfarefitness.com%2Flogin&lang=en';

describe('toOwnAuthActionLink', () => {
  it('moves the link onto our domain and keeps the code', () => {
    const out = new URL(toOwnAuthActionLink(fbReset, APP));
    expect(out.origin).toBe('https://warfarefitness.com');
    expect(out.pathname).toBe('/auth/action');
    expect(out.searchParams.get('oobCode')).toBe('ABC-123_xyz');
    expect(out.searchParams.get('mode')).toBe('resetPassword');
  });

  it('carries continueUrl and lang through', () => {
    const out = new URL(toOwnAuthActionLink(fbReset, APP));
    expect(out.searchParams.get('continueUrl')).toBe('https://warfarefitness.com/login');
    expect(out.searchParams.get('lang')).toBe('en');
  });

  it('drops the apiKey — no reason to carry a second copy through an inbox', () => {
    const out = new URL(toOwnAuthActionLink(fbReset, APP));
    expect(out.searchParams.get('apiKey')).toBeNull();
  });

  it('handles verifyEmail the same way', () => {
    const fb = 'https://warfare-fitness.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=ZZZ';
    const out = new URL(toOwnAuthActionLink(fb, APP));
    expect(out.searchParams.get('mode')).toBe('verifyEmail');
    expect(out.searchParams.get('oobCode')).toBe('ZZZ');
  });

  it('does not mangle a code containing URL-significant characters', () => {
    const fb = 'https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=' +
      encodeURIComponent('a+b/c=d&e');
    const out = new URL(toOwnAuthActionLink(fb, APP));
    expect(out.searchParams.get('oobCode')).toBe('a+b/c=d&e');
  });

  // Everything below must fall back rather than produce a broken link: this is
  // the flow someone uses when they are already locked out.
  it('falls back when there is no oobCode', () => {
    const fb = 'https://x.firebaseapp.com/__/auth/action?mode=resetPassword';
    expect(toOwnAuthActionLink(fb, APP)).toBe(fb);
  });

  it('falls back when there is no mode', () => {
    const fb = 'https://x.firebaseapp.com/__/auth/action?oobCode=ABC';
    expect(toOwnAuthActionLink(fb, APP)).toBe(fb);
  });

  it('falls back on an unparseable link', () => {
    expect(toOwnAuthActionLink('not a url at all', APP)).toBe('not a url at all');
  });

  it('falls back on an unparseable appUrl rather than throwing', () => {
    expect(toOwnAuthActionLink(fbReset, 'nonsense')).toBe(fbReset);
  });
});
