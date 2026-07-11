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

const nextConfig = {
  reactStrictMode: true,
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

module.exports = withPWA(nextConfig);
