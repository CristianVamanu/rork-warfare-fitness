export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Browsers request the literal path /favicon.ico directly, independent of
 * whatever <link rel="icon"> tags a page declares — a well-known legacy
 * behavior that several browsers give equal or HIGHER priority than the
 * declared tags. Next.js's file-convention favicon.ico only supports a
 * STATIC file baked in at build time (confirmed the hard way: replacing it
 * with a route handler at the same literal path breaks the production
 * build outright — Next's metadata-file webpack scanner looks for a real
 * file there unconditionally). A static file can never reflect the admin's
 * actual configured favicon/logo, only whatever was bundled at the last
 * deploy — confirmed live: the dynamic <link rel="icon"> tag in
 * layout.tsx already correctly pointed at the admin's uploaded favicon,
 * but the browser tab kept showing the old static placeholder anyway,
 * even in a fresh incognito window (ruling out simple favicon caching).
 *
 * src/middleware.ts rewrites real /favicon.ico traffic to this route
 * instead (invisible to the browser — it still sees /favicon.ico), which
 * reads the same system config layout.tsx's metadata does and redirects to
 * whichever icon is actually configured right now. The static file stays
 * in place only to satisfy Next's build-time scanner; it's no longer what
 * actually answers a real request.
 */

import { NextResponse } from 'next/server';
import { getAdminDb, getAdminApp } from '@/lib/firebase-admin';

const DEFAULT_ICON_PATH = '/icons/icon-192x192.png';

// Every page load in every tab requests /favicon.ico, so this route is hit
// far more often than any normal page — without these two caches it would
// mean a Firestore read per favicon request across every visitor, which is
// real recurring cost and latency for a value that changes maybe twice a
// year. The in-process cache covers repeat hits on a warm server; the
// Cache-Control header lets the browser skip the request entirely. Both
// are deliberately short so a newly-uploaded favicon still appears within
// minutes rather than needing a redeploy (the whole point of replacing the
// build-time static file).
const CONFIG_TTL_MS = 5 * 60 * 1000;
const FIRESTORE_TIMEOUT_MS = 2000;
let cachedIconUrl: { url: string; at: number } | null = null;

async function resolveIconUrl(): Promise<string> {
  if (cachedIconUrl && Date.now() - cachedIconUrl.at < CONFIG_TTL_MS) {
    return cachedIconUrl.url;
  }
  const app = getAdminApp();
  if (!app) return DEFAULT_ICON_PATH;
  const db = getAdminDb(app);
  // A hanging Firestore read must never hold a favicon request (and with
  // it, a browser connection slot) open indefinitely — fall back to the
  // bundled icon rather than stalling.
  const snap = await Promise.race([
    db.collection('system').doc('config').get(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('config read timed out')), FIRESTORE_TIMEOUT_MS)
    ),
  ]);
  const cfg = snap.exists ? snap.data() : null;
  const url = (cfg?.faviconUrl as string) || (cfg?.logoUrl as string) || DEFAULT_ICON_PATH;
  cachedIconUrl = { url, at: Date.now() };
  return url;
}

export async function GET(req: Request) {
  let iconUrl = DEFAULT_ICON_PATH;
  try {
    iconUrl = await resolveIconUrl();
  } catch {
    // Fall through to the bundled default below.
  }

  let target: URL;
  try {
    // Resolve relative to the ORIGIN, not to this route's own path — a
    // stored value like "icons/x.png" (no leading slash) would otherwise
    // resolve against /api/dynamic-favicon and 404 as /api/icons/x.png.
    target = new URL(iconUrl, new URL(req.url).origin);
  } catch {
    target = new URL(DEFAULT_ICON_PATH, new URL(req.url).origin);
  }
  // Guard against redirecting back to ourselves: /favicon.ico is rewritten
  // to this route by middleware, so a config value of "/favicon.ico" (or
  // this route's own path) would bounce between the two forever.
  if (target.pathname === '/favicon.ico' || target.pathname === '/api/dynamic-favicon') {
    target = new URL(DEFAULT_ICON_PATH, new URL(req.url).origin);
  }

  const res = NextResponse.redirect(target, 307);
  res.headers.set('Cache-Control', 'public, max-age=300');
  return res;
}
