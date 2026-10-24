'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PARTNER_QUERY_PARAM } from '@/lib/partners';

/**
 * Reports a `?pref=CODE` landing to /api/partner/click, once per page load.
 * The middleware already set the attribution cookie at the edge; this is only
 * the click count. /p/CODE links count themselves server-side and never pass
 * through here. Renders nothing.
 */
export function PartnerRefCapture() {
  const params = useSearchParams();
  const code = params.get(PARTNER_QUERY_PARAM);
  useEffect(() => {
    if (!code) return;
    const key = `wf:pref:${code.toUpperCase()}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* count anyway */ }
    fetch('/api/partner/click', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ code, landing: window.location.pathname }),
    }).catch(() => {});
  }, [code]);
  return null;
}
