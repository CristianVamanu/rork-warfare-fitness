import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // No authenticated route is listed here — a security scan flagged
        // that naming them in a public robots.txt is free reconnaissance,
        // confirming exactly which paths exist behind auth to anyone who
        // reads the file (this is exactly how attackers enumerate hidden
        // areas). Every one of these is kept out of the search index
        // instead via a per-route X-Robots-Tag: noindex response header
        // (see next.config.js), which achieves the same "don't index this"
        // goal without publicly announcing the paths. /onboarding is the
        // one exception worth noting — it's the primary public conversion
        // funnel (quiz runs before any signup) and was never disallowed.
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
