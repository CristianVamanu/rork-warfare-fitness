'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';

export interface Branding { appName: string; logoUrl: string | null }

const FALLBACK: Branding = { appName: 'Warfare Fitness', logoUrl: null };

/**
 * Admin branding, fetched once per page load and shared.
 *
 * Module-level, not per-component: the rail and the drawer both render the
 * brand, and every admin route mounts the shell, so a plain effect would
 * refetch the same document on every navigation. getSystemConfig is a network
 * read with a three second ceiling, which is not something to pay repeatedly
 * for a name and an image.
 */
let cached: Branding | null = null;
let inFlight: Promise<Branding> | null = null;

function load(): Promise<Branding> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= getSystemConfig()
    .then((cfg) => {
      const c = (cfg ?? {}) as { appName?: string; logoUrl?: string };
      cached = {
        appName: c.appName?.trim() || FALLBACK.appName,
        logoUrl: c.logoUrl?.trim() || null,
      };
      return cached;
    })
    .catch(() => FALLBACK)
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(cached ?? FALLBACK);
  useEffect(() => {
    let live = true;
    load().then((b) => { if (live) setBranding(b); });
    return () => { live = false; };
  }, []);
  return branding;
}
