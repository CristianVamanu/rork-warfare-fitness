import type { User } from 'firebase/auth';
import { getIdToken } from 'firebase/auth';

/** Opens Stripe Checkout for a specific membership plan tier. Redirects on success. */
export async function startPlanCheckout(user: User, planId: string): Promise<string | null> {
  try {
    const token = await getIdToken(user);
    const res = await fetch('/api/stripe/plan-checkout', {
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
