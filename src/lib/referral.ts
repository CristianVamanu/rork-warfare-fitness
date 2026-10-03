/**
 * Pure helpers for referral codes. No Firestore, no auth — testable on
 * their own, used by /api/referral/link (which owns generating and
 * uniqueness-checking) and by nothing else.
 */

// No 0/O, 1/I/L, or other pairs that misread on a phone screen. 31 symbols,
// so a 7-character code is 31^7 ≈ 27 billion combinations — collisions are
// a retry-loop concern, not a design one, at any membership count this app
// will realistically reach.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateReferralCode(length = 7): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** What /api/referral/link accepts back if a client ever round-trips a code. */
export function isValidReferralCode(code: unknown): code is string {
  return typeof code === 'string' && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,16}$/.test(code);
}
