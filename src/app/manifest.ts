import type { MetadataRoute } from 'next';
import { getSystemConfig } from '@/lib/firestore';

// Regenerate at most once an hour — avoids a Firestore read on every single
// PWA install-check request while still picking up admin branding changes
// reasonably quickly.
export const revalidate = 3600;

// The admin logo upload accepts any image type (accept="image/*" — JPG,
// WEBP, GIF, etc.), not just PNG. A manifest icon whose declared `type`
// doesn't match the actual file's real MIME type can be silently rejected
// by the browser per the Web App Manifest spec — breaking "Add to Home
// Screen"'s icon (or PWA installability entirely) for any site where the
// admin uploaded a non-PNG logo. Both upload paths (Firebase Storage,
// R2 presign) preserve the original filename/extension in the resulting
// URL, so it can be recovered from there instead of hardcoding PNG.
function guessImageMimeType(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'avif': return 'image/avif';
    default: return 'image/png';
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cfg = await getSystemConfig().catch(() => null);
  const name = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = cfg?.logoUrl as string | undefined;
  const faviconUrl = cfg?.faviconUrl as string | undefined;
  // A dedicated favicon (small, square) is what a PWA install icon
  // actually needs — a large banner-style logo scaled down to an app-icon
  // size often looks wrong or unrecognizable. Prefer it over the logo
  // when the admin has uploaded one.
  const primaryIconUrl = faviconUrl || logoUrl;

  const bundledIcons = [
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

  // A custom icon's entries all point at the SAME remote URL — if that
  // request is ever slow, CORS-blocked, or briefly unreachable, the
  // entire icon set fails at once with nothing to fall back to, and
  // Chrome/Android shows a plain theme_color circle instead of any icon
  // at all (reported live as "just a yellow dot" — #F5A623 is this app's
  // theme_color). Listing the custom icon FIRST (browsers prefer earlier
  // entries when several match) but keeping the always-available bundled
  // icons in the list too means one bad fetch of the remote file no
  // longer takes out the icon entirely — it just falls back to the
  // built-in one instead of a bare color swatch.
  const icons = primaryIconUrl
    ? [
        { src: primaryIconUrl, sizes: '192x192', type: guessImageMimeType(primaryIconUrl), purpose: 'any' as const },
        { src: primaryIconUrl, sizes: '192x192', type: guessImageMimeType(primaryIconUrl), purpose: 'maskable' as const },
        { src: primaryIconUrl, sizes: '512x512', type: guessImageMimeType(primaryIconUrl) },
        ...bundledIcons,
      ]
    : bundledIcons;

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
