/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  // Overridable so deploy.sh can build the service worker + its
  // content-hashed worker-*.js chunk into a staging location instead of
  // writing straight into the LIVE public/ folder mid-build. next-pwa
  // writes these files directly to disk regardless of NEXT_DIST_DIR (that
  // only affects .next), so without this a real user's browser could
  // fetch a still-being-overwritten sw.js right as a deploy replaces the
  // worker-*.js chunk it references — surfacing as "importScripts...not
  // allowed" and a blank page, reported in production.
  dest: process.env.NEXT_PWA_DEST || 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  customWorkerDir: 'worker',
  // app-build-manifest.json is an internal Next.js build artifact that's
  // never actually served over HTTP under /_next/ with the App Router —
  // next-pwa's auto-generated precache list includes it anyway, and the
  // resulting 404 fails the whole precache install step, permanently
  // stuck the service worker in "installing" and never activating.
  //
  // .js.map files are excluded for the same reason, and this is the real
  // fix for the recurring "bad-precaching-response" 404s reported in
  // production: Workbox's own build-time size limit already skips large
  // maps (observed directly in a build log — "won't be precached"), but
  // smaller ones still get listed. Source maps serve no purpose to an end
  // user's browser (they're irrelevant to the app actually running) and
  // there's no reason to ever precache them — excluding the whole
  // extension removes this failure mode entirely instead of hoping every
  // future deploy's map files happen to still exist by the time a
  // browser's install step gets around to fetching them.
  buildExcludes: [/app-build-manifest\.json$/, /\.map$/],
  // With frequent redeploys (every push auto-deploys), a service worker
  // that was mid-install or already active from a previous build can end
  // up serving/precaching references to JS chunk files that no longer
  // exist once the next build replaces them with new content hashes —
  // surfaced as "no-response" errors on page navigation (observed on a
  // freshly added route, reproducible even in a brand-new incognito
  // session with no prior cache). Page navigations now always go straight
  // to the network instead of ever being served from precache/runtime
  // cache, so a stale worker can never serve a broken cached page —
  // static assets (JS/CSS/images/fonts) keep their normal caching, this
  // only affects the HTML document request itself.
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkOnly',
    },
    // The rule above only matches a hard/full page load — App Router
    // client-side transitions (clicking a <Link>, router.push, e.g.
    // switching between /training/[id] program pages) fetch the RSC
    // payload via plain fetch(), request.mode 'cors'/'same-origin', NOT
    // 'navigate'. Those fell through to next-pwa's bundled "others"
    // catch-all below (NetworkFirst, 10s timeout) — reported as program
    // switching taking a very long time, and confirmed by a real
    // "no-response" Workbox error on a /training/[id] navigation.
    // Matching every same-origin non-API request here, before the
    // next-pwa spread, and forcing NetworkOnly closes that gap. Static
    // assets (JS/CSS/images/fonts) are already matched by next-pwa's more
    // specific earlier default rules, so this only catches the leftover
    // document/RSC requests that should never be served from cache.
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
    // Firestore traffic must never be served from cache — without this,
    // next-pwa's bundled cross-origin catch-all (NetworkFirst, 1 hour
    // cache) can serve a stale Firestore read for up to an hour after an
    // admin edits content, e.g. a shortened program description still
    // showing the old, longer text. Scoped to Firestore's own hostname
    // specifically (not a blanket **.googleapis.com match) so it doesn't
    // shadow the Firebase Storage video-caching rule right below, which
    // also lives under googleapis.com.
    {
      urlPattern: ({ url }) => url.hostname === 'firestore.googleapis.com',
      handler: 'NetworkOnly',
    },
    // next-pwa's bundled defaults match video files with /\.(?:mp4)$/ —
    // requires the URL to literally END in ".mp4". Firebase Storage and R2
    // download URLs always have `?alt=media&token=...` (or similar) appended
    // after the extension, so exercise-library videos never match that rule
    // and fall through to the generic cross-origin NetworkFirst handler,
    // which has no rangeRequests support. <video> elements always fetch via
    // HTTP Range requests, and Workbox can't correctly serve/cache a partial
    // response without that option — surfaces as "no-response" errors and
    // videos failing to load/play. Matching on pathname (which strips the
    // query string) instead, with rangeRequests enabled, fixes this for
    // every video host the app uses.
    {
      urlPattern: ({ url }) => /\.(?:mp4|mov|webm|m4v)$/i.test(url.pathname),
      handler: 'CacheFirst',
      options: {
        rangeRequests: true,
        cacheName: 'remote-video-assets',
        expiration: { maxEntries: 48, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    ...require('next-pwa/cache'),
  ],
});

// Build-timestamp version — "YYYY.MM.DD.HHmm" (UTC) — so the version shown
// in Settings always tells you exactly when this build was produced,
// instead of a raw git commit count (which used to read differently on
// different hosts depending on how deep their git clone was — a shallow
// clone undercounts commits, making the "version" look stale even on a
// perfectly up-to-date deploy). The time component means multiple deploys
// on the same day still get distinct, naturally-ordered version strings.
function getAppVersion() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = now.getUTCFullYear();
  const m = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const hm = pad(now.getUTCHours()) + pad(now.getUTCMinutes());
  return `${y}.${m}.${d}.${hm}`;
}

// A security scan flagged every response as missing standard security
// headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, Permissions-Policy) plus a leaked X-Powered-By: Next.js
// header — all fixed below. Content-Security-Policy is NOT here — it needs
// a fresh nonce per request (so an attacker can't just read a static CSP
// and forge a matching inline script), which a static next.config.js
// header can't provide. It's generated per-request in src/middleware.ts
// instead. Checkout is a full-page redirect to Stripe's hosted page (see
// src/lib/checkout.ts's window.location.href), not an embedded iframe, so
// no frame-src/frame-ancestors allowance for Stripe is needed there.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera is genuinely used (barcode scan, food photo, scan-a-gym) so it's
  // allowed for this origin only; everything else this app never uses is
  // denied outright rather than left to browser defaults.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self)' },
  // Isolates this origin's browsing context from other tabs/windows opened
  // via window.open() — safe to set unconditionally here since this app
  // has no popup-based OAuth flow (only email/password sign-in, see
  // src/lib/auth.ts) that COOP could otherwise interfere with.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  // Removes the X-Powered-By: Next.js response header — free reconnaissance
  // for an attacker (framework + implied version range) with zero upside.
  poweredByHeader: false,
  // Lets deploy.sh build into a staging directory instead of overwriting
  // the live .next that the running server is still lazily loading route
  // bundles from (see deploy.sh for the full rationale). Unset at runtime,
  // so `next start` always resolves the normal '.next'.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // ESLint exists as a manual/CI gate (`npx next lint`) — it must NOT gate
  // production builds yet, because the config was only just added and the
  // pre-existing codebase carries legacy warnings that would otherwise
  // turn every deploy red the moment .eslintrc.json landed.
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
  // Mark all pages as dynamic to avoid SSR with Firebase
  output: undefined,
  // sw.js must never be cached by a CDN/browser — if Cloudflare (or any
  // intermediary) serves a stale sw.js after a deploy, the browser can end
  // up installing a service worker whose precache manifest lists chunk
  // filenames from an OLDER build that no longer exist on the server
  // (surfaces as "importScripts... not allowed" / "bad-precaching-response"
  // 404s in the console — a real report from a rapid-redeploy session).
  // Forcing no-cache means every page load always re-checks sw.js against
  // the current deploy instead of possibly running one build behind it.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      // Keeps /admin out of search indexes without naming it in the public
      // robots.txt (see src/app/robots.ts) — a security scan flagged
      // listing an admin panel's exact path there as free reconnaissance.
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.googleapis.com' },
      { protocol: 'https', hostname: '**.firebaseapp.com' },
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: '**.firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**.imgur.com' },
      { protocol: 'https', hostname: 'i.imgur.com' },
    ],
  },
  experimental: {
    // pdf-parse (built on pdfjs-dist) locates its worker script relative to
    // its own module location at runtime — webpack bundling it into a
    // .next/server/chunks/*.js file breaks that lookup because the sibling
    // pdf.worker.mjs asset doesn't get copied alongside it. Marking it
    // external keeps it as a plain `require('pdf-parse')` from node_modules
    // at runtime instead, where the worker file sits right where the
    // library expects it.
    serverComponentsExternalPackages: ['firebase-admin', 'pdf-parse'],
  },
};

const { withSentryConfig } = require('@sentry/nextjs');

// Wrapping with Sentry is safe even when it isn't configured — with no
// NEXT_PUBLIC_SENTRY_DSN set, Sentry.init() (in the sentry.*.config.ts
// files) never fires, so this only adds a no-op build step. Source-map
// upload (for readable stack traces instead of minified ones) additionally
// needs SENTRY_AUTH_TOKEN/ORG/PROJECT — without those it just skips that
// step with a build-time warning rather than failing.
module.exports = withSentryConfig(withPWA(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
