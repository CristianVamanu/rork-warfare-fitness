import type { User } from 'firebase/auth';

/** Opens Stripe Checkout for the platform membership. Redirects on success. */
export async function startMembershipCheckout(user: User): Promise<string | null> {
  try {
    const res = await fetch('/api/stripe/member-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.uid, userEmail: user.email }),
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
    const res = await fetch('/api/stripe/coaching-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.uid, userEmail: user.email, planId }),
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
