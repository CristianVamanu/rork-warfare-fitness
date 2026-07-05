import type { MetadataRoute } from 'next';
import { getSystemConfig } from '@/lib/firestore';

// Regenerate at most once an hour — avoids a Firestore read on every single
// PWA install-check request while still picking up admin branding changes
// reasonably quickly.
export const revalidate = 3600;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cfg = await getSystemConfig().catch(() => null);
  const name = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = cfg?.logoUrl as string | undefined;

  const icons = logoUrl
    ? [
        { src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any' as const },
        { src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'maskable' as const },
        { src: logoUrl, sizes: '512x512', type: 'image/png' },
      ]
    : [
        { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
        { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
        { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
        { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
        { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' as const },
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
        { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
        { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ];

  return {
    id: '/',
    name,
    short_name: name.length > 12 ? name.split(' ')[0] : name,
    description: 'Premium fitness tracking and AI-powered coaching',
    theme_color: '#F5A623',
    background_color: '#0A0A0A',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/dashboard',
    scope: '/',
    lang: 'en',
    icons,
    categories: ['health', 'fitness', 'lifestyle'],
  };
}
