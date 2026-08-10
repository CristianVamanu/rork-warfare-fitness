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
        // authenticated app routes. /admin is deliberately NOT listed here
        // — a security scan flagged that naming it in a public robots.txt
        // is free reconnaissance confirming the admin panel's exact URL to
        // an attacker. It's kept out of the search index instead via an
        // X-Robots-Tag: noindex response header (see next.config.js),
        // which achieves the same "don't index this" goal without
        // publicly announcing the path.
        disallow: ['/api/', '/dashboard', '/training', '/nutrition', '/community', '/settings', '/install'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
