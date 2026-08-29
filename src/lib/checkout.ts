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
