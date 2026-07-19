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
        // /onboarding is now the primary public conversion funnel (quiz
        // runs before any signup), so it stays crawlable unlike the other
        // authenticated app routes.
        disallow: ['/api/', '/admin', '/dashboard', '/training', '/nutrition', '/community', '/settings', '/install'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
