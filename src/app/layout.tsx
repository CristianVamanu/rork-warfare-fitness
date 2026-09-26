import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { themeBootstrapScript } from '@/lib/theme';
import { getSystemConfig } from '@/lib/firestore';
import { ServiceWorkerUpdater } from '@/components/ui/ServiceWorkerUpdater';
import { AppToaster } from '@/components/ui/AppToaster';
import { ChunkErrorReloader } from '@/components/ui/ChunkErrorReloader';
import { ErrorReporter } from '@/components/ui/ErrorReporter';
import { CookieConsent } from '@/components/ui/CookieConsent';
import { ConsentGatedScripts } from '@/components/ui/ConsentGatedScripts';

// generateMetadata runs on EVERY server render — and with the app layout
// force-dynamic, that is every navigation. It read system/config from
// Firestore each time (through the client SDK, on the server, which is also
// the source of the build-time "auth/invalid-api-key" noise). Branding
// changes when an admin edits it, not per request: cache it for a minute.
let brandingCache: { at: number; promise: Promise<Record<string, unknown> | null> } | null = null;
function getBranding(): Promise<Record<string, unknown> | null> {
  if (brandingCache && Date.now() - brandingCache.at < 60_000) return brandingCache.promise;
  const promise = getSystemConfig().catch(() => null) as Promise<Record<string, unknown> | null>;
  promise.then((v) => { if (v === null) brandingCache = null; });
  brandingCache = { at: Date.now(), promise };
  return promise;
}

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getBranding();
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
      capable: true,
      statusBarStyle: 'black-translucent',
      title: name,
    },
    // Next renders `capable` as the standard mobile-web-app-capable tag
    // only. Safari on iPhone still reads the Apple-prefixed one to decide
    // whether a home-screen icon opens full screen or as a browser view
    // with an address bar and a close button. Emit both.
    other: { 'apple-mobile-web-app-capable': 'yes' },
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
        {/* Runs before first paint. If this device has a signed-in session
            (a flag AuthContext keeps in localStorage — Firebase's own session
            lives in IndexedDB, which nothing synchronous can read), mark
            <html> so CSS shows the brand splash instead of the landing page
            until the redirect to the dashboard lands. Strangers have no
            flag and see the fully server-rendered landing immediately,
            which is what search engines and paid traffic get too. The
            landing used to render a spinner for EVERYONE on the server to
            avoid a flash for the few; this gives both. Nonce'd for the CSP. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('wf:session')==='1')document.documentElement.setAttribute('data-wf-session','1')}catch(e){}",
          }}
        />
        {/* Light mode, early, on app-shell paths only — so a signed-in
            member who prefers it does not watch the dashboard paint dark
            and flip. Public paths are never touched here, and the provider
            has the final say once it runs (lib/theme). Nonce'd for the CSP. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }}
        />
        {/* Open the connection to Firebase Storage (exercise demo videos,
            uploaded images) as early as possible, so the TLS/DNS handshake
            is already done by the time a video element needs to fetch —
            shaves a real chunk off first-frame latency on top of fixing
            "moov atom at end of file" MP4s with ffmpeg -movflags +faststart. */}
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        {/* /checkout: the TLS handshakes to Stripe happen while the page is
            still rendering, instead of after the first script tag appears. */}
        <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://checkout.stripe.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
      </head>
      <body>
        {/* ThemeProvider INSIDE AuthProvider. The other way round, its
            useAuth() only ever saw the context default (user: null), so the
            saved theme was never loaded on sign-in and the toggle never
            persisted — and it had no way to go dark on sign-out. */}
        <AuthProvider>
        <ThemeProvider>
          {children}
          <ServiceWorkerUpdater />
          <ChunkErrorReloader />
          <ErrorReporter />
          <CookieConsent />
          <AppToaster />
        </ThemeProvider>
        </AuthProvider>
        <ConsentGatedScripts nonce={nonce} />
      </body>
    </html>
  );
}
