'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getIdToken } from 'firebase/auth';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { ChevronLeft, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackground } from '@/components/ui/AppBackground';
import { AuthBrandMark } from '@/components/auth/AuthBrandMark';
import { BrandSplash } from '@/components/ui/BrandSplash';
import { Button } from '@/components/ui/Button';
import { getSystemConfig } from '@/lib/firestore';
import { startHostedPlanCheckout } from '@/lib/checkout';
import { parseCheckoutParams, rememberCheckoutIntent } from '@/lib/checkoutMode';

/**
 * Checkout, on our own domain.
 *
 * Stripe's Embedded Checkout: the same form Stripe hosts, rendered in an
 * iframe on this page — card fields never touch us, 3-D Secure and
 * Apple/Google Pay work exactly as before, PCI scope is unchanged. What
 * changes is that the buyer never leaves the site, and comes back to
 * /checkout/complete → the dashboard rather than to a Stripe page.
 *
 * Three ways this degrades, none of them to a dead button:
 *  - not signed in → /login, and the checkout is resumed after sign-in
 *  - Stripe.js or the publishable key unavailable → the old hosted
 *    checkout, same session, same prices
 *  - the session cannot be created (plan inactive, already a member) →
 *    the server's reason, with a way back
 */
type Phase = 'booting' | 'ready' | 'hosted' | 'error';

export function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { planId, months } = useMemo(() => parseCheckoutParams((k) => searchParams.get(k)), [searchParams]);

  const [appName, setAppName] = useState('Warfare Fitness');
  const [phase, setPhase] = useState<Phase>('booting');
  const [error, setError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  // The provider asks for the client secret once; a re-render must never
  // create a second Stripe session for the same click.
  const secretRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    getSystemConfig().then((cfg) => { if (cfg?.appName) setAppName(cfg.appName as string); }).catch(() => {});
  }, []);

  // Sign-in gate. The intended checkout is remembered so login can resume it.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      rememberCheckoutIntent(`${window.location.pathname}${window.location.search}`);
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const fetchClientSecret = useCallback((): Promise<string> => {
    if (secretRef.current) return secretRef.current;
    secretRef.current = (async () => {
      if (!user || !planId) throw new Error('not ready');
      const token = await getIdToken(user);
      const res = await fetch('/api/stripe/plan-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userEmail: user.email, planId, periodMonths: months, embedded: true }),
      });
      const data = await res.json().catch(() => ({})) as { clientSecret?: string; url?: string; error?: string };
      if (data.clientSecret) return data.clientSecret;
      // A server still on hosted mode answers with a URL — honour it.
      if (data.url) { window.location.href = data.url; return new Promise<string>(() => {}); }
      const msg = data.error ?? 'Could not start checkout right now. Try again in a moment.';
      setError(msg);
      setPhase('error');
      throw new Error(msg);
    })();
    return secretRef.current;
  }, [user, planId, months]);

  // Stripe.js — or fall back to hosted checkout if it cannot be loaded.
  useEffect(() => {
    if (authLoading || !user) return;
    if (!planId) { setError('No plan was selected.'); setPhase('error'); return; }
    let alive = true;
    // Creating the Stripe session is several round-trips on the server;
    // loading Stripe.js is a ~200KB script. They used to run one after the
    // other (session only once the provider mounted). Start the session
    // now, in parallel — the provider reuses the same memoised promise.
    void fetchClientSecret().catch(() => { /* surfaced via phase/error */ });
    (async () => {
      try {
        const res = await fetch('/api/stripe/publishable-key');
        const data = await res.json().catch(() => ({})) as { key?: string };
        if (!res.ok || !data.key) throw new Error('no publishable key');
        // Wait for Stripe.js itself, not just the key. If the script cannot
        // load (blocked, offline) loadStripe rejects — caught below and the
        // buyer goes to the hosted page instead of staring at a white box.
        const stripe = await loadStripe(data.key);
        if (!stripe) throw new Error('stripe.js unavailable');
        if (!alive) return;
        setStripePromise(Promise.resolve(stripe));
        setPhase('ready');
      } catch {
        if (!alive) return;
        // Hosted Stripe Checkout: identical session, identical prices,
        // just on Stripe's page. Never a dead end.
        setPhase('hosted');
        const err = await startHostedPlanCheckout(user, planId, months);
        if (err && alive) { setError(err); setPhase('error'); }
      }
    })();
    return () => { alive = false; };
  }, [authLoading, user, planId, months, fetchClientSecret]);

  // Stable identity — a new options object would re-initialise the iframe.
  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  // Watchdog. Stripe.js loading proves the script is reachable, not that
  // the checkout FRAME can render (a frame-src block, an extension, a
  // webview that refuses third-party frames). If no iframe has appeared
  // inside the panel after 15s, take the hosted route rather than leave a
  // blank panel with a "Secure checkout" label over it.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== 'ready' || !user || !planId) return;
    const t = setTimeout(async () => {
      if (panelRef.current?.querySelector('iframe')) return;
      console.warn('[checkout] embedded frame never rendered — falling back to hosted checkout');
      setPhase('hosted');
      const err = await startHostedPlanCheckout(user, planId, months);
      if (err) { setError(err); setPhase('error'); }
    }, 15_000);
    return () => clearTimeout(t);
  }, [phase, user, planId, months]);

  if (authLoading || !user || phase === 'booting') return <BrandSplash label="Preparing secure checkout" />;
  if (phase === 'hosted') return <BrandSplash label="Opening secure checkout" />;

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      <AppBackground />

      <header className="relative z-10 max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-text-tertiary">
          <Lock className="w-3.5 h-3.5 text-accent" /> Secure checkout
        </span>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 pb-16 pt-2">
        <AuthBrandMark title={appName} subtitle="You're one step away." eager />

        {phase === 'error' ? (
          <div
            className="rounded-3xl border p-6 text-center backdrop-blur-xl"
            style={{ backgroundColor: 'var(--card-glass-bg)', borderColor: 'var(--card-glass-border)' }}
          >
            <p className="text-sm font-bold text-white">Checkout couldn&apos;t open</p>
            <p className="text-sm text-text-secondary mt-2">{error}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4" /> Try again
              </Button>
              <Button variant="ghost" onClick={() => router.push('/profile')}>Back to profile</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Stripe's form is light on purpose — it is the one part of the
                page a buyer must trust on sight, and a card form that looks
                like every other card form they have used is what earns that.
                The ember glow and the grid around it are ours. */}
            <div ref={panelRef} className="rounded-3xl overflow-hidden bg-white border border-white/10 shadow-[0_30px_80px_-30px_rgba(245,166,35,0.55)] min-h-[480px]">
              <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
            <div className="mt-4 space-y-1.5 text-center">
              <p className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Payments are handled by Stripe. Your card details never touch our servers.
              </p>
              <p className="text-[11px] text-text-tertiary">Cancel anytime from your profile.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
