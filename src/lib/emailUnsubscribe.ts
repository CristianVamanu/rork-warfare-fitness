import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Unsubscribe links — server only.
 *
 * Kept apart from lib/emailSequences because that module is imported by the
 * admin page (for the sequence names and days), so it must stay free of
 * Node built-ins. Nothing here is needed in a browser.
 */

// ── Unsubscribe tokens ───────────────────────────────────────────────────

export type UnsubscribeScope = 'lead' | 'user';

/**
 * HMAC over the address and scope. Anyone holding the link can unsubscribe
 * that address — which is the point; a link that needed a login would be
 * an unsubscribe most people never complete — but nobody can mint a link
 * for an address they do not hold.
 */
export function unsubscribeToken(secret: string, email: string, scope: UnsubscribeScope): string {
  return createHmac('sha256', secret).update(`${scope}:${email.trim().toLowerCase()}`).digest('hex');
}

export function verifyUnsubscribeToken(secret: string, email: string, scope: UnsubscribeScope, token: string): boolean {
  const expected = unsubscribeToken(secret, email, scope);
  if (typeof token !== 'string' || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(token, 'utf8'));
}

export function unsubscribeUrl(appUrl: string, secret: string, email: string, scope: UnsubscribeScope): string {
  const e = email.trim().toLowerCase();
  const t = unsubscribeToken(secret, e, scope);
  return `${appUrl.replace(/\/$/, '')}/api/email/unsubscribe?e=${encodeURIComponent(e)}&s=${scope}&t=${t}`;
}

/**
 * The secret that signs unsubscribe links. When it is absent, NO marketing
 * email may be sent — a marketing email without a working unsubscribe is
 * the one failure this system must never produce. Reused server secrets
 * rather than a new one, so an existing deployment needs no new config.
 */
export function unsubscribeSecret(): string | null {
  return process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || null;
}
