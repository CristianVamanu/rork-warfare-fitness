'use client';

import { useEffect } from 'react';

/**
 * Reports uncaught client errors to /api/client-error.
 *
 * Replaces the visibility Sentry used to provide, without a third party or a
 * ~100KB SDK. Listens for the two things that actually escape React's error
 * boundaries — window 'error' and 'unhandledrejection' — and posts a message
 * and stack. Nothing else: no breadcrumbs, no user data, no PII.
 *
 * Everything here is defensive on purpose. Error reporting that can itself
 * throw, or that reports its own failures, is worse than none: it turns one
 * bug into a loop. Hence the send cap, the dedupe, and the swallowed fetch.
 */

const MAX_REPORTS_PER_PAGELOAD = 5;

// Third-party scripts (chat widgets, analytics) throw inside their own
// bundles for reasons this app cannot fix or act on. Filing them as if they
// were our bugs is how a real error gets lost in the noise.
const IGNORED = [
  /reportAllChanges/,          // vendored web-vitals inside a third-party widget
  /ResizeObserver loop/,       // benign, fires on any resize-heavy layout
  /Script error\.?$/,          // cross-origin error with no detail to act on
];

export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    const report = (kind: 'error' | 'unhandledrejection', message: string, stack?: string) => {
      if (!message || sent >= MAX_REPORTS_PER_PAGELOAD) return;
      if (IGNORED.some((re) => re.test(message) || (stack && re.test(stack)))) return;
      const key = `${message}|${stack?.split('\n')[1] ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      try {
        void fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, message, stack, url: window.location.pathname }),
          keepalive: true, // still delivered if this fires during a navigation
        }).catch(() => {});
      } catch { /* reporting must never throw */ }
    };

    const onError = (e: ErrorEvent) => report('error', e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report('unhandledrejection', r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
