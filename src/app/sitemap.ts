import type { MetadataRoute } from 'next';

// This is a single-tenant, mostly-authenticated app — the only truly public,
// worth-indexing pages are the marketing/auth surface. Everything past login
// is excluded in robots.ts anyway, so there's nothing more to list here.
export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  const now = new Date();
  return [
    { url: appUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${appUrl}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${appUrl}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${appUrl}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${appUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
