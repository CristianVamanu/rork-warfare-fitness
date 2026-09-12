/**
 * Product + ad analytics — Google Analytics 4, with Meta Pixel for the four
 * ad-conversion events only.
 *
 * Both scripts only load when their env var is actually set (see
 * AnalyticsScripts in layout.tsx), so a dev/staging environment with no
 * pixel configured never fires real events at Meta/Google. trackEvent()
 * itself is always safe to call regardless — it no-ops if the underlying
 * script never loaded (e.g. an ad-blocker, or pixels not configured at
 * all), rather than throwing and breaking the calling code path (signup,
 * checkout) over an analytics failure.
 *
 * Until this taxonomy existed the whole product emitted four events (lead,
 * sign-up, begin checkout, purchase) — enough to measure ad spend, not
 * enough to answer whether anyone reaches a first workout or where
 * onboarding loses them. The product events below are GA4-only: Meta has no
 * use for them, and sending them there would only inflate the pixel's
 * event volume.
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
const GA_EVENT = {
  // Ad conversions (mirrored to Meta above)
  Lead: 'generate_lead',
  CompleteRegistration: 'sign_up',
  Purchase: 'purchase',
  InitiateCheckout: 'begin_checkout',
  // Product funnel (GA4 only)
  OnboardingStep: 'onboarding_step',
  OnboardingComplete: 'onboarding_complete',
  ProgramAssigned: 'program_assigned',
  WorkoutStarted: 'workout_started',
  WorkoutCompleted: 'workout_completed',
  WorkoutAbandoned: 'workout_abandoned',
  WorkoutDraftRestored: 'workout_draft_restored',
  MealLogged: 'meal_logged',
  BarcodeScanned: 'barcode_scanned',
  PaywallViewed: 'paywall_viewed',
} as const;

export type AnalyticsEvent = keyof typeof GA_EVENT;

export function trackEvent(name: AnalyticsEvent, params?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return;
    const meta = META_EVENT[name];
    if (meta) window.fbq?.('track', meta, params);
    window.gtag?.('event', GA_EVENT[name], params);
  } catch {
    // Never let a broken/blocked analytics script break the real user flow.
  }
}
