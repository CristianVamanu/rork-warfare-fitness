/**
 * Cloudflare Turnstile verification for the two public, unauthenticated
 * forms (landing lead, trainer lead).
 *
 * Those forms are rate-limited by IP, but the IP comes from
 * `x-forwarded-for`, which is attacker-controlled unless a trusted proxy
 * overwrites it — and this repo ships no proxy config. Rotating the header
 * defeats the limit entirely, so the limiter is a speed bump and a CAPTCHA
 * is the actual control.
 *
 * Inert until configured: with no TURNSTILE_SECRET_KEY set, verification is
 * skipped and the forms behave exactly as before. That keeps this safe to
 * deploy before the keys exist, and makes turning it on a pure env change.
 * Set both:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY   (widget, client)
 *   TURNSTILE_SECRET_KEY             (verification, server)
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — do not block real submissions
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[turnstile] verification rejected:', data['error-codes']);
    }
    return data.success === true;
  } catch (err) {
    // Cloudflare unreachable. Fail OPEN: these are marketing lead forms, and
    // silently swallowing genuine leads during a third-party outage costs
    // more than the spam a brief window lets through. The rate limiter still
    // applies.
    console.error('[turnstile] verification unavailable, allowing through:', err);
    return true;
  }
}
