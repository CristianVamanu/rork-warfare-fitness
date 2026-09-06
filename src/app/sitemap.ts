import type { MetadataRoute } from 'next';

// This is a single-tenant, mostly-authenticated app — the only truly public,
// worth-indexing pages are the marketing/auth surface. Everything past login
// is excluded in robots.ts anyway, so there's nothing more to list here.
//
// /trainers, /download, and /b2b-terms are all public and NOT disallowed in
// robots.ts (unlike /dashboard, /training, etc.) — /trainers in particular
// is the real lead-gen page for the B2B white-label offer, so it belongs
// here just as much as /login or /terms.
export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  const now = new Date();
  return [
    { url: appUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${appUrl}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${appUrl}/onboarding`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${appUrl}/trainers`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${appUrl}/download`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${appUrl}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${appUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${appUrl}/b2b-terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
