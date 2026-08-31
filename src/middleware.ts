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
    // A prior attempt scoped unsafe-inline to style-src-attr only, on the
    // assumption this app never injects raw <style> blocks — that was
    // wrong. Framer Motion (AnimatePresence/layout animations) and the
    // digimetrix.ai chat widget both inject actual <style> elements at
    // runtime, which style-src-elem governs, not style-src-attr — the
    // scoped version blocked those outright (observed live: "Applying
    // inline style violates... style-src-elem", widget/animations broken
    // in production). unsafe-inline has to cover both style-src-elem and
    // style-src-attr for this app to render correctly; style-src is kept
    // as the combined fallback for browsers that don't support the elem/
    // attr split at all.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' https: blob:",
    // fonts.gstatic.com is also needed here, not just in font-src — the PWA
    // service worker's CacheFirst strategy for the "others" catch-all
    // fetches font files via the Fetch API to populate its cache, and
    // fetch() calls are governed by connect-src regardless of what the
    // resource actually is. font-src alone only covers the browser's own
    // native @font-face loading, not a script-initiated fetch of the same
    // URL — missing this here blocked every woff2 the service worker tried
    // to cache, reported live as repeated CSP violations + "no-response"
    // Workbox errors.
    // www.facebook.com/tr is the Meta Pixel's own tracking beacon endpoint;
    // *.google-analytics.com and *.analytics.google.com are GA4's — both
    // pixels are loaded (consent-gated) by ConsentGatedScripts and fire
    // real network requests to these on every trackEvent() call, which
    // connect-src (not script-src) governs regardless of where the script
    // that initiated them was loaded from.
    // apis.google.com is Firebase Auth's own lazily-loaded iframe manager
    // (js/api.js). It's allowed as a SCRIPT via strict-dynamic, but the PWA
    // service worker intercepts the request and re-issues it as a fetch()
    // (see next.config.js's NetworkOnly rule for this exact hostname) — and
    // fetch is governed by connect-src, not script-src, regardless of what
    // the resource actually is. Without it here the request was blocked
    // outright, surfacing as a CSP violation plus a "Response with null
    // body status cannot have body" throw from the SW's own error handler.
    // www.googletagmanager.com is the SAME situation as apis.google.com
    // above — GA4's own loader script (gtag/js?id=...) is allowed as a
    // SCRIPT via strict-dynamic, but the service worker's runtime-caching
    // strategy re-issues that same request as a fetch() to populate its
    // cache, which only connect-src governs. Missing it here blocked the
    // request outright the moment GA was actually turned on (reported live:
    // "violates... connect-src", "no-response" from NetworkFirst.js).
    "connect-src 'self' https://*.googleapis.com https://apis.google.com https://*.firebaseapp.com https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.sentry.io https://*.ingest.sentry.io https://digimetrix.ai https://*.supabase.co https://fonts.gstatic.com https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    // Firebase Auth opens a hidden same-project iframe at
    // <project>.firebaseapp.com/__/auth/iframe as part of its normal init
    // (session persistence / cross-tab auth-state sync) — this fires even
    // for plain email/password sign-in, not just OAuth popups. It's
    // Firebase's own domain for this project, so allowing it here is safe;
    // 'none' was blocking it outright (seen live as a framing CSP violation
    // on every page load).
    // youtube.com/youtube-nocookie.com — the onboarding welcome-video modal
    // embeds an admin-configured YouTube URL (system/config.videoGreetingUrl)
    // as an iframe; without this it's silently blocked by the CSP with no
    // visible error beyond the console, reported live as "the welcome video
    // doesn't show" right after finishing onboarding.
    "frame-src https://*.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com",
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
