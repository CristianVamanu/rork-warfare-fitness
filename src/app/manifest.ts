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

  // Every bundled icon above is a PLACEHOLDER: a flat #F5A623 circle on
  // #0A0A0A and literally nothing else (verified — each file contains
  // exactly two distinct colors). That is the "yellow dot", and it was
  // never a theme_color fallback; it is a real image being served.
  //
  // This list used to declare the custom icon at 192 and 512 only, then
  // append all nine bundled entries as a supposed safety net. But a
  // manifest icon list is a set of ALTERNATIVES the browser chooses
  // between up front by size — it is not a retry chain, and no browser
  // re-picks a different entry when its first choice fails to load. So
  // the six sizes the custom icon did not declare (72, 96, 128, 144,
  // 152, 384) resolved to the placeholder by design, and whichever size
  // a given surface happened to ask for decided whether the real icon or
  // the yellow dot appeared. That is exactly the reported symptom: some
  // sizes correct, some yellow.
  //
  // With a custom icon configured, declare it for every size and drop
  // the placeholders entirely — there is no size left that can resolve
  // to a yellow circle. The genuine fallback for an unreachable custom
  // icon is /favicon.ico, which middleware routes to /api/dynamic-favicon
  // and which already falls back to the bundled file on a failed fetch.
  //
  // `maskable` is deliberately NOT claimed for a custom upload. Android
  // crops a maskable icon to roughly its inner 80%, so declaring an
  // arbitrary uploaded image maskable clips its edges; without the claim
  // the launcher just letterboxes the `any` icon instead, which is the
  // correct result for an image whose safe zone we cannot know.
  const customType = primaryIconUrl ? guessImageMimeType(primaryIconUrl) : 'image/png';
  const icons = primaryIconUrl
    ? bundledIcons
        .filter((i) => i.purpose !== 'maskable')
        .map((i) => ({ src: primaryIconUrl, sizes: i.sizes, type: customType, purpose: 'any' as const }))
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
