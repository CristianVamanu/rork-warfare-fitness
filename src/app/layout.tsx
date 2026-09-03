import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getSystemConfig } from '@/lib/firestore';
import { ServiceWorkerUpdater } from '@/components/ui/ServiceWorkerUpdater';
import { AppToaster } from '@/components/ui/AppToaster';
import { ChunkErrorReloader } from '@/components/ui/ChunkErrorReloader';
import { CookieConsent } from '@/components/ui/CookieConsent';
import { ConsentGatedScripts } from '@/components/ui/ConsentGatedScripts';

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSystemConfig().catch(() => null);
  const name = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = cfg?.logoUrl as string | undefined;
  const faviconUrl = cfg?.faviconUrl as string | undefined;
  const description = 'Premium fitness tracking and AI-powered coaching';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  // Falls back to the app icon for social previews when no dedicated
  // share image has been set — better than no image at all, which is what
  // "no OG tags" previously meant (a bare, imageless link card everywhere
  // this URL got shared: iMessage, Slack, Twitter/X, Discord, etc).
  // logoUrl first (a banner-shaped logo suits a link card better than a
  // square app icon), then the uploaded favicon, and only then the bundled
  // file — which is the same two-color placeholder as the rest of
  // /icons/*, so it should be the last resort rather than the second.
  const ogImage = logoUrl || faviconUrl || `${appUrl}/icons/icon-512x512.png`;

  return {
    metadataBase: new URL(appUrl),
    title: name,
    description,
    // No explicit `manifest` field — Next's file convention auto-serves
    // src/app/manifest.ts at /manifest.webmanifest and links it for us.
    appleWebApp: {
      statusBarStyle: 'black-translucent',
      title: name,
    },
    // A dedicated favicon (small, square — admin-uploaded separately from
    // the main logo, which is often a large banner-style image that turns
    // into an unrecognizable blob shrunk to 16x16px) is preferred for the
    // tab icon when set; falls back to the logo, then the bundled default.
    // This previously listed the custom URL AND /icons/icon-192x192.png as
    // two <link rel="icon"> entries, intended as a fallback pair. It is not
    // one. Multiple rel="icon" links are alternatives a browser picks
    // between BEFORE fetching — normally by their `sizes` attribute — and
    // neither entry declared `sizes` at all, so the choice was arbitrary
    // and browsers frequently picked the bundled file. That bundled file is
    // a placeholder containing exactly two colors (#F5A623 on #0A0A0A): the
    // yellow dot. Offering it as a peer of the real icon meant the tab
    // sometimes rendered the placeholder even when the upload was perfectly
    // reachable.
    //
    // One candidate only, marked `sizes: 'any'` so it wins at every size.
    // The real fallback is /favicon.ico, which src/middleware.ts rewrites to
    // /api/dynamic-favicon — that route serves the configured icon's bytes
    // and already falls back to the bundled file if the upload is
    // unreachable, which is a fallback that actually runs on failure.
    icons: faviconUrl || logoUrl
      ? { icon: [{ url: (faviconUrl || logoUrl)!, sizes: 'any' }], apple: (faviconUrl || logoUrl)! }
      : { icon: '/icons/icon-192x192.png', apple: '/icons/icon-192x192.png' },
    openGraph: {
      title: name,
      description,
      url: appUrl,
      siteName: name,
      images: [{ url: ogImage, width: 512, height: 512 }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: name,
      description,
      images: [ogImage],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-to-zoom was disabled entirely (maximumScale: 1, userScalable:
  // false) — a common but real accessibility failure that blocks
  // low-vision users from zooming in on any page. Allow zoom up to 5x.
  maximumScale: 5,
  themeColor: '#F5A623',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/middleware.ts on every request — required to authorize the
  // inline/third-party <Script> tags below under the nonce-based CSP (a
  // static nonce baked into the HTML wouldn't protect against anything,
  // since an attacker could just read it out of the page source).
  // Next 15: request APIs (headers/cookies/params) are async.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Open the connection to Firebase Storage (exercise demo videos,
            uploaded images) as early as possible, so the TLS/DNS handshake
            is already done by the time a video element needs to fetch —
            shaves a real chunk off first-frame latency on top of fixing
            "moov atom at end of file" MP4s with ffmpeg -movflags +faststart. */}
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
      </head>
      <body>
        <ThemeProvider>
        <AuthProvider>
          {children}
          <ServiceWorkerUpdater />
          <ChunkErrorReloader />
          <CookieConsent />
          <AppToaster />
        </AuthProvider>
        </ThemeProvider>
        <ConsentGatedScripts nonce={nonce} />
      </body>
    </html>
  );
}
