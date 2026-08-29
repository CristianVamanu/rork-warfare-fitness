import type { User } from 'firebase/auth';
import { getIdToken } from 'firebase/auth';

/** Opens Stripe Checkout for a specific membership plan tier + billing term
 * (1/3/6/12 months — defaults to monthly). Redirects on success. */
export async function startPlanCheckout(user: User, planId: string, periodMonths: 1 | 3 | 6 | 12 = 1): Promise<string | null> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/plan-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userEmail: user.email, planId, periodMonths }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return null;
    }
    return data.error ?? 'Failed to open checkout';
  } catch {
    return 'Failed to start checkout';
  }
}

/** Opens Stripe's billing portal — the only correct way to move an EXISTING
 * subscriber to a different plan (proration, etc). startPlanCheckout can't
 * do this: /api/stripe/plan-checkout unconditionally rejects any caller who
 * already has membership.status === 'active' with "You already have an
 * active membership", so an active member always needs this instead.
 * Redirects on success; returns an error string on failure. */
export async function openBillingPortal(user: User): Promise<string | null> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return null;
    }
    return data.error ?? 'Failed to open billing portal';
  } catch {
    return 'Failed to open billing portal';
  }
}

export interface PlanChangePreview {
  prorationAmount: number; // Positive = charged on next invoice, negative = credited
  currency: string;
  nextInvoiceDate?: number; // ms epoch
}

/** Computes what switching to this plan/term would credit or charge on the
 * next invoice, WITHOUT committing anything — call this before changePlan()
 * so the user can confirm the amount first. Returns null on failure. */
export async function previewPlanChange(user: User, planId: string, periodMonths: 1 | 3 | 6 | 12 = 1): Promise<PlanChangePreview | { error: string }> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId, periodMonths, preview: true }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; prorationAmount?: number; currency?: string; nextInvoiceDate?: number };
    if (data.ok && data.prorationAmount !== undefined && data.currency) {
      return { prorationAmount: data.prorationAmount, currency: data.currency, nextInvoiceDate: data.nextInvoiceDate };
    }
    return { error: data.error ?? 'Failed to preview plan change' };
  } catch {
    return { error: 'Failed to preview plan change' };
  }
}

/** Previews the proration amount, shows a native confirm() with it, and only
 * proceeds to the actual changePlan() call if the user confirms. Shared by
 * every "switch plan" button so the wording/behavior can't drift between
 * PaywallGate's PlanUpgradeScreen and the Profile page's plan cards.
 * Returns an error string on failure, null on success or on user cancel
 * (cancel isn't a failure — callers just shouldn't show a success toast). */
export async function confirmAndChangePlan(user: User, planId: string, planName: string, periodMonths: 1 | 3 | 6 | 12 = 1): Promise<{ changed: boolean; error: string | null }> {
  const preview = await previewPlanChange(user, planId, periodMonths);
  if ('error' in preview) return { changed: false, error: preview.error };

  const amount = Math.abs(preview.prorationAmount).toLocaleString(undefined, { style: 'currency', currency: preview.currency.toUpperCase() });
  const dateStr = preview.nextInvoiceDate ? new Date(preview.nextInvoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'your next billing date';
  const message = preview.prorationAmount > 0
    ? `Switch to ${planName}? You'll be charged a prorated ${amount} on ${dateStr} for the difference.`
    : preview.prorationAmount < 0
    ? `Switch to ${planName}? You'll receive a prorated ${amount} credit toward your invoice on ${dateStr}.`
    : `Switch to ${planName}? No proration charge or credit applies.`;

  if (!window.confirm(message)) return { changed: false, error: null };

  const err = await changePlan(user, planId, periodMonths);
  return { changed: !err, error: err };
}

/** Switches an already-active member to a different plan/billing term, in
 * place (Stripe prorates the difference) — see /api/stripe/change-plan for
 * why this doesn't go through the billing portal. Returns an error string
 * on failure, null on success (caller should refresh the member's profile). */
export async function changePlan(user: User, planId: string, periodMonths: 1 | 3 | 6 | 12 = 1): Promise<string | null> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ planId, periodMonths }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) return null;
    return data.error ?? 'Failed to change plan';
  } catch {
    return 'Failed to change plan';
  }
}

/** Opens Stripe Checkout for a specific 1:1 coaching plan. Redirects on success. */
export async function startCoachingCheckout(user: User, planId: string): Promise<string | null> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/coaching-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userEmail: user.email, planId }),
    });
    const data = await res.json() as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return null;
    }
    return data.error ?? 'Failed to open checkout';
  } catch {
    return 'Failed to start checkout';
  }
}
