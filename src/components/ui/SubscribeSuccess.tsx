'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { trackEvent } from '@/lib/analytics';

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
    if (subscribed === '1') {
      toast.success('Membership activated! Welcome aboard 🎉');
      trackEvent('Purchase');
      onSuccess();
    } else if (subscribed === 'coaching') {
      toast.success('Coaching plan activated! Your trainer has been notified 🎉');
      trackEvent('Purchase');
      onSuccess();
    }
    // Once, on arrival. Re-running would re-toast on every param change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
