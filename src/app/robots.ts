import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything behind auth is pointless for a crawler to index and
        // just wastes crawl budget — keep it to the actual public surface.
        disallow: ['/api/', '/admin', '/dashboard', '/training', '/nutrition', '/community', '/settings', '/onboarding', '/install'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
