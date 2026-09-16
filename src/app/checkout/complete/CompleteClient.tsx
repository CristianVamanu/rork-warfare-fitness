'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { AppBackground } from '@/components/ui/AppBackground';
import { AuthBrandMark } from '@/components/auth/AuthBrandMark';
import { Button } from '@/components/ui/Button';
import { rememberCheckoutIntent } from '@/lib/checkoutMode';

/**
 * Where Stripe sends the buyer after an embedded checkout. Confirms the
 * session finished, then lands them on the dashboard — the home screen —
 * with the same ?subscribed=1 the hosted flow used, so the "payment
 * received" toast and the live paywall lift behave identically.
 *
 * Membership itself is granted by the webhook, not here; this page only
 * decides between "into the app" and "that didn't go through".
 */
export function CompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<'checking' | 'unpaid' | 'error'>('checking');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Session persistence survives the round-trip in practice; if it did
      // not, come back here after sign-in rather than losing the result.
      rememberCheckoutIntent(`${window.location.pathname}${window.location.search}`);
      router.replace('/login');
      return;
    }
    if (!sessionId) { router.replace('/dashboard'); return; }
    let alive = true;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch(`/api/stripe/checkout-session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({})) as { status?: string; paymentStatus?: string; kind?: string | null };
        if (!alive) return;
        if (res.ok && data.status === 'complete') {
          router.replace(data.kind === 'coaching' ? '/dashboard?subscribed=coaching' : '/dashboard?subscribed=1');
          return;
        }
        setState(res.ok ? 'unpaid' : 'error');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [authLoading, user, sessionId, router]);

  if (state === 'checking') return <BrandSplash label="Confirming your payment" />;

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      <AppBackground />
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-10 pb-16">
        <AuthBrandMark title="Warfare Fitness" />
        <div
          className="rounded-3xl border p-6 text-center backdrop-blur-xl"
          style={{ backgroundColor: 'var(--card-glass-bg)', borderColor: 'var(--card-glass-border)' }}
        >
          <p className="text-sm font-bold text-white">
            {state === 'unpaid' ? 'That payment didn’t go through' : 'We couldn’t confirm the payment'}
          </p>
          <p className="text-sm text-text-secondary mt-2">
            {state === 'unpaid'
              ? 'Nothing was charged. You can start again from your profile whenever you’re ready.'
              : 'If you were charged, your membership will unlock automatically within a minute. If not, try again from your profile.'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button onClick={() => router.push('/profile')}>Back to profile</Button>
            <Button variant="ghost" onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
