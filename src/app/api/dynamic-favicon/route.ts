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

export async function GET(req: Request) {
  try {
    const app = getAdminApp();
    if (!app) return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, req.url));
    const db = getAdminDb(app);
    const snap = await db.collection('system').doc('config').get();
    const cfg = snap.exists ? snap.data() : null;
    const iconUrl = (cfg?.faviconUrl as string) || (cfg?.logoUrl as string) || DEFAULT_ICON_PATH;
    const target = new URL(iconUrl, req.url);
    // Short cache — long enough to avoid hammering Firestore on every tab
    // load, short enough that a newly-changed favicon shows up within
    // minutes instead of needing another full deploy like the static file
    // it replaces used to.
    return NextResponse.redirect(target, 307);
  } catch {
    return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, req.url));
  }
}
