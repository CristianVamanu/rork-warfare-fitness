/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  customWorkerDir: 'worker',
  // app-build-manifest.json is an internal Next.js build artifact that's
  // never actually served over HTTP under /_next/ with the App Router —
  // next-pwa's auto-generated precache list includes it anyway, and the
  // resulting 404 fails the whole precache install step, permanently
  // stuck the service worker in "installing" and never activating.
  buildExcludes: [/app-build-manifest\.json$/],
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

const nextConfig = {
  reactStrictMode: true,
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
    serverComponentsExternalPackages: ['firebase-admin'],
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
