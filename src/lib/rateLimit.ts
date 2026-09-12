import { getAdminApp, getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Fixed-window rate limiter backed by Firestore.
 *
 * Every rate limit in the API used to be a module-level Map of timestamps.
 * That is per-process state, and this app runs under pm2 in cluster mode
 * with two workers (ecosystem.config.js) — so every "3 per 15 minutes" was
 * really "up to 6 per 15 minutes, depending on which worker you hit", and
 * all counters reset to zero on every deploy's reload. A single shared
 * counter in Firestore is what the limit was always supposed to be.
 *
 * One document per (scope, key) holding the current window's start and
 * count, bumped inside a transaction so two concurrent requests cannot both
 * read 2 and both write 3. Same pattern as lib/usageLimit.ts. Cost is one
 * transactional read+write per limited request — these endpoints are the
 * cheap, rarely-hit ones (lead forms, welcome email, daily tip), so that is
 * negligible.
 *
 * If the Admin SDK is not configured at all (misconfigured install), the
 * limiter falls back to an in-process window rather than failing open with
 * no limit or failing closed and taking the endpoint down.
 */
export interface RateLimitOptions {
  /** Namespace for the counter, e.g. 'landing-lead'. */
  scope: string;
  /** Who is being limited — an IP, a uid, anything stable. */
  key: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets — suitable for Retry-After. */
  retryAfterSeconds: number;
}

// Firestore document IDs cannot contain '/', and IPv6 keys contain ':' which
// is fine, but keep everything to a safe charset and bounded length anyway.
function docId(scope: string, key: string): string {
  const safe = key.replace(/[^A-Za-z0-9_.:@-]/g, '_').slice(0, 120);
  return `${scope}__${safe}`;
}

const fallbackLog = new Map<string, number[]>();
function fallbackLimit({ scope, key, windowMs, max }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const id = docId(scope, key);
  const ts = (fallbackLog.get(id) ?? []).filter((t) => now - t < windowMs);
  ts.push(now);
  fallbackLog.set(id, ts);
  if (fallbackLog.size > 5000) fallbackLog.clear();
  const allowed = ts.length <= max;
  return { allowed, remaining: Math.max(0, max - ts.length), retryAfterSeconds: Math.ceil(windowMs / 1000) };
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const app = getAdminApp();
  if (!app) return fallbackLimit(opts);

  const { scope, key, windowMs, max } = opts;
  const db = getAdminDb(app);
  const ref = db.collection('rateLimits').doc(docId(scope, key));

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.exists ? (snap.data() as { windowStart?: Timestamp; count?: number }) : null;
      const windowStartMs = data?.windowStart?.toMillis?.() ?? 0;
      const inWindow = now - windowStartMs < windowMs;
      const count = inWindow ? (data?.count ?? 0) : 0;

      if (count >= max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      if (inWindow) {
        tx.update(ref, { count: FieldValue.increment(1), updatedAt: Timestamp.now() });
      } else {
        // expiresAt lets a Firestore TTL policy on rateLimits.expiresAt sweep
        // stale counters for free; without the policy they are just small,
        // harmless docs that get overwritten on the next window.
        tx.set(ref, {
          windowStart: Timestamp.fromMillis(now),
          count: 1,
          updatedAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(now + windowMs * 2),
        });
      }
      const retryAfterSeconds = Math.max(1, Math.ceil(((inWindow ? windowStartMs : now) + windowMs - now) / 1000));
      return { allowed: true, remaining: max - count - 1, retryAfterSeconds };
    });
  } catch (err) {
    // A transient Firestore failure must not take a public form down — but it
    // also must not silently remove the limit. Fall back to the in-process
    // window for this request and log it so a persistent failure is visible.
    console.error('[rateLimit] Firestore transaction failed, using in-process fallback:', err);
    return fallbackLimit(opts);
  }
}

/** The client IP as seen through the reverse proxy chain, or 'unknown'. */
export function clientIp(req: Request): string {
  // Note: x-forwarded-for is attacker-controlled unless a trusted proxy in
  // front of this server overwrites it. Behind Cloudflare/nginx configured
  // to do so it is correct; without one, an attacker can rotate the header
  // to dodge an IP-keyed limit. That is a deployment property, not
  // something this function can fix — a CAPTCHA on public forms is the
  // real answer for abuse that matters.
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}
