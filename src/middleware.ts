import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware runs on Edge - we check installer status via a lightweight approach
// The actual installer check happens client-side due to Firebase SDK limitations in Edge

// A security scan flagged the CSP's script-src as weakened by unsafe-inline/
// unsafe-eval — both let injected code run, defeating most of what CSP is
// for. Fixed here (not in next.config.js's static headers, which can't
// vary per request) with a per-request nonce: every inline/first-party
// script gets a fresh, unguessable token that only this response's CSP
// authorizes, so an attacker-injected <script> tag has no way to know the
// right nonce and gets blocked outright — the actual attack unsafe-inline
// left open. 'strict-dynamic' extends that trust to scripts a nonce'd
// script loads dynamically (e.g. the digimetrix.ai widget's own loader),
// so the explicit host allowlist below is a fallback for older browsers
// that don't support strict-dynamic, not the primary trust mechanism.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // btoa (not Buffer, which isn't guaranteed in the Edge runtime middleware
  // executes under) — randomUUID()'s output is plain ASCII, so this is a
  // safe base64 encode with no Unicode edge cases to worry about.
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://digimetrix.ai`,
    // Framer Motion (used extensively across this app) animates by writing
    // directly to elements' style="" attributes at runtime — CSP has no
    // nonce/hash mechanism for that, only an allow-or-block unsafe-inline
    // toggle, so this one has to stay permissive or every animation on the
    // site breaks. Real-world exposure is much lower than script-src's
    // used to be: a style-only injection can deface layout, but can't
    // execute JS or exfiltrate data the way an unsafe-inline script-src
    // could.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.sentry.io https://*.ingest.sentry.io https://digimetrix.ai https://*.supabase.co",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  // Allow public assets, API routes, and install page
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/workbox-'
  ) {
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // x-nonce is read by the root layout (via next/headers) to stamp the
  // same nonce onto the inline/third-party <Script> tags it renders —
  // without this round-trip there'd be no way for a Server Component to
  // know the nonce this middleware just generated for the current request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
