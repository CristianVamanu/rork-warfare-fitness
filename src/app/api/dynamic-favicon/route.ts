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

// Cached image BYTES, not just the URL. Serving the actual bytes from this
// origin (rather than 307-redirecting the browser to R2) matters: a
// cross-origin redirect for /favicon.ico is handled inconsistently across
// browsers, and it was still showing the old icon in practice even once
// the redirect itself was verifiably correct. Same-origin bytes with a
// correct Content-Type is the one shape every browser handles the same
// way. The payload is a few KB, so holding it in memory is cheap.
const ICON_BYTES_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
let cachedIcon: { body: ArrayBuffer; contentType: string; at: number } | null = null;

export async function GET(req: Request) {
  if (cachedIcon && Date.now() - cachedIcon.at < ICON_BYTES_TTL_MS) {
    return new NextResponse(cachedIcon.body, {
      headers: { 'Content-Type': cachedIcon.contentType, 'Cache-Control': 'public, max-age=300' },
    });
  }

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
  // Guard against fetching ourselves: /favicon.ico is rewritten to this
  // route by middleware, so a config value of "/favicon.ico" (or this
  // route's own path) would recurse.
  if (target.pathname === '/favicon.ico' || target.pathname === '/api/dynamic-favicon') {
    target = new URL(DEFAULT_ICON_PATH, new URL(req.url).origin);
  }

  try {
    const upstream = await fetch(target.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) throw new Error(`icon fetch failed: ${upstream.status}`);
    const body = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'image/png';
    cachedIcon = { body, contentType, at: Date.now() };
    return new NextResponse(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    // Configured icon unreachable (bad URL, R2 permissions, upstream down)
    // — fall back to the bundled one rather than serving a broken icon.
    // Deliberately NOT cached, so it retries rather than pinning the
    // fallback for the full TTL once the real icon comes back.
    console.error('[dynamic-favicon] Falling back to bundled icon:', err);
    return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, new URL(req.url).origin), 307);
  }
}
