import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from 'react-hot-toast';
import { getSystemConfig } from '@/lib/firestore';
import { ServiceWorkerUpdater } from '@/components/ui/ServiceWorkerUpdater';
import { ChunkErrorReloader } from '@/components/ui/ChunkErrorReloader';
import { CookieConsent } from '@/components/ui/CookieConsent';

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSystemConfig().catch(() => null);
  const name = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = cfg?.logoUrl as string | undefined;
  const description = 'Premium fitness tracking and AI-powered coaching';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  // Falls back to the app icon for social previews when no dedicated
  // share image has been set — better than no image at all, which is what
  // "no OG tags" previously meant (a bare, imageless link card everywhere
  // this URL got shared: iMessage, Slack, Twitter/X, Discord, etc).
  const ogImage = logoUrl || `${appUrl}/icons/icon-512x512.png`;

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
    icons: logoUrl
      ? { icon: logoUrl, apple: logoUrl }
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: 'var(--surface-elevated)',
                color: 'var(--foreground)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#10B981', secondary: 'var(--surface-elevated)' },
              },
              error: {
                iconTheme: { primary: '#EF4444', secondary: 'var(--surface-elevated)' },
              },
            }}
          />
        </AuthProvider>
        </ThemeProvider>
        <Script id="chirps-config" strategy="afterInteractive">
          {`window.chirpsConfig = { assistantId: "e663729e-796a-44d9-98a8-316824eebcb0" };`}
        </Script>
        <Script src="https://digimetrix.ai/embed.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
