import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Toaster } from 'react-hot-toast';
import { getSystemConfig } from '@/lib/firestore';

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSystemConfig().catch(() => null);
  const name = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = cfg?.logoUrl as string | undefined;

  return {
    title: name,
    description: 'Premium fitness tracking and AI-powered coaching',
    // No explicit `manifest` field — Next's file convention auto-serves
    // src/app/manifest.ts at /manifest.webmanifest and links it for us.
    appleWebApp: {
      statusBarStyle: 'black-translucent',
      title: name,
    },
    icons: logoUrl
      ? { icon: logoUrl, apple: logoUrl }
      : { icon: '/icons/icon-192x192.png', apple: '/icons/icon-192x192.png' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <LanguageProvider>
          {children}
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
        </LanguageProvider>
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
