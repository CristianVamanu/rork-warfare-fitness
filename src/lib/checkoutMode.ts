/**
 * The seams of on-site checkout, kept pure so they can be unit-tested.
 *
 * Checkout used to bounce every buyer to checkout.stripe.com and back. It
 * now happens on /checkout on our own domain (Stripe's Embedded Checkout —
 * the same product in an iframe, so card fields still never touch us, 3DS
 * and Apple/Google Pay still work, and PCI scope is unchanged). Hosted
 * Checkout remains the fallback when Stripe.js cannot load, so a missing
 * publishable key degrades to the old flow rather than to a dead button.
 */

export type CheckoutTerm = 1 | 3 | 6 | 12;

const TERMS: readonly CheckoutTerm[] = [1, 3, 6, 12];

/** Where a "Start for $1" / "Subscribe" button sends someone now. */
export function checkoutPagePath(planId: string, months: CheckoutTerm = 1): string {
  const params = new URLSearchParams({ plan: planId, months: String(months) });
  return `/checkout?${params.toString()}`;
}

/** Reads the page's own params back. An unknown term is monthly, never a throw. */
export function parseCheckoutParams(get: (key: string) => string | null): { planId: string | null; months: CheckoutTerm } {
  const planId = (get('plan') ?? '').trim() || null;
  const raw = Number(get('months'));
  const months = (TERMS as readonly number[]).includes(raw) ? (raw as CheckoutTerm) : 1;
  return { planId, months };
}

/**
 * The Stripe session fields that decide where the buyer ends up. Embedded
 * sessions take a single return_url (Stripe substitutes the session id);
 * hosted ones take success/cancel. The two are mutually exclusive on the
 * Stripe API, which is why this is one function and not two spread objects
 * at the call site.
 */
export function checkoutReturnParams(opts: { embedded: boolean; appUrl: string }):
  | { ui_mode: 'embedded'; return_url: string }
  | { success_url: string; cancel_url: string } {
  const base = opts.appUrl.replace(/\/+$/, '');
  return opts.embedded
    ? { ui_mode: 'embedded', return_url: `${base}/checkout/complete?session_id={CHECKOUT_SESSION_ID}` }
    : { success_url: `${base}/dashboard?subscribed=1`, cancel_url: `${base}/profile` };
}

// ── Resume-after-login ──────────────────────────────────────────────────────
// Someone signed out who taps a plan lands on /login. Without this they came
// back to the dashboard and had to find the plan again; the checkout they
// were on is remembered for one tab session and resumed after sign-in.

const INTENT_KEY = 'wf:checkout-intent';

/** Only same-origin app paths are ever stored, so this can never be used to bounce a login somewhere else. */
export function isSafeResumePath(path: string | null | undefined): path is string {
  return !!path && /^\/(checkout|dashboard)(\?|\/|$)/.test(path) && !path.startsWith('//');
}

export function rememberCheckoutIntent(path: string): void {
  if (!isSafeResumePath(path)) return;
  try { sessionStorage.setItem(INTENT_KEY, path); } catch { /* private mode — they just land on the dashboard */ }
}

/** Returns the remembered path once, then forgets it. */
export function consumeCheckoutIntent(): string | null {
  try {
    const v = sessionStorage.getItem(INTENT_KEY);
    if (v) sessionStorage.removeItem(INTENT_KEY);
    return isSafeResumePath(v) ? v : null;
  } catch {
    return null;
  }
}
