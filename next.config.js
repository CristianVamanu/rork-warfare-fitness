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
