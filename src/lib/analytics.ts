/**
 * Ad conversion tracking — Meta Pixel + Google Analytics 4.
 *
 * Both scripts only load when their env var is actually set (see
 * AnalyticsScripts in layout.tsx), so a dev/staging environment with no
 * pixel configured never fires real events at Meta/Google. trackEvent()
 * itself is always safe to call regardless — it no-ops if the underlying
 * script never loaded (e.g. an ad-blocker, or pixels not configured at
 * all), rather than throwing and breaking the calling code path (signup,
 * checkout) over an analytics failure.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

// Meta and GA4 use different event vocabularies for the same real-world
// action — this map lets call sites use one name and fire both correctly,
// instead of every call site needing to know both platforms' conventions.
const META_EVENT: Record<string, string> = {
  Lead: 'Lead',
  CompleteRegistration: 'CompleteRegistration',
  Purchase: 'Purchase',
  InitiateCheckout: 'InitiateCheckout',
};
const GA_EVENT: Record<string, string> = {
  Lead: 'generate_lead',
  CompleteRegistration: 'sign_up',
  Purchase: 'purchase',
  InitiateCheckout: 'begin_checkout',
};

export function trackEvent(name: keyof typeof META_EVENT, params?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return;
    window.fbq?.('track', META_EVENT[name], params);
    window.gtag?.('event', GA_EVENT[name], params);
  } catch {
    // Never let a broken/blocked analytics script break the real user flow.
  }
}
