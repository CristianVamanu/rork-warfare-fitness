'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { trackEvent } from '@/lib/analytics';
import { announceOnce } from '@/lib/purchaseNotice';

/**
 * Handles the ?subscribed= flag Stripe sends the member back with.
 *
 * Shared because checkout now returns people to the dashboard rather than
 * their profile — paying should open the thing you paid for, not a settings
 * page — while the profile keeps handling it too. A checkout session started
 * before that change still carries the old success URL, and someone mid-
 * payment when it deployed should not land on a page that silently ignores
 * the result of it.
 *
 * Its own component so useSearchParams does not opt the whole page into
 * client-side rendering of the search params.
 */
export function SubscribeSuccess({ onSuccess }: { onSuccess: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const subscribed = searchParams.get('subscribed');
    // "Payment received", not "activated": Stripe redirects the member here
    // BEFORE its webhook has necessarily reached us, and the webhook is what
    // flips membership.status. For a few seconds — occasionally longer —
    // the plan can still show as locked. The profile listener lifts it live
    // the moment the webhook lands, so nothing needs polling; the wording
    // just has to not promise something the screen is not yet showing.
    // announceOnce, not just the parameter: confirming an email code
    // reloads this exact URL, and without it the member is thanked for a
    // payment they made minutes ago — and a second Purchase conversion is
    // reported for one sale. See lib/purchaseNotice.
    if (subscribed === '1') {
      if (announceOnce('1')) {
        toast.success('Payment received — unlocking your membership now 🎉', { duration: 6000 });
        trackEvent('Purchase');
      }
      // onSuccess refreshes the profile and is safe to repeat — it is how
      // the screen picks up the webhook's write, which may still be in
      // flight on a reload.
      onSuccess();
    } else if (subscribed === 'coaching') {
      if (announceOnce('coaching')) {
        toast.success('Payment received — your trainer has been notified 🎉', { duration: 6000 });
        trackEvent('Purchase');
      }
      onSuccess();
    }
    // Once, on arrival. Re-running would re-toast on every param change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
