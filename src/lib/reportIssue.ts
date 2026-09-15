/**
 * Deliberately report a HANDLED failure to the same place uncaught errors go.
 *
 * ErrorReporter only sees what escapes: window 'error' and 'unhandledrejection'.
 * Everything caught and logged with console.error is invisible to the admin
 * Errors tab and to the daily digest — which is how a broken signup ran in
 * production without anyone knowing. The account was created, the profile
 * listener died, the app logged it to a console nobody was looking at, and the
 * first report came from a person trying to sign up.
 *
 * Use this only where a swallowed failure means the product is broken for that
 * member, not for anything routine or retryable. Every report costs a document
 * write and, more importantly, a slot in the attention of whoever reads the
 * digest — a noisy channel gets ignored, which puts us back where we started.
 *
 * Never throws and never rejects. Reporting that can itself fail loudly turns
 * one bug into two.
 */
export function reportIssue(message: string, detail?: unknown): void {
  try {
    if (typeof window === 'undefined') return;
    const stack = detail instanceof Error
      ? detail.stack ?? detail.message
      : detail !== undefined ? String(detail) : undefined;
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'error',
        message,
        stack,
        url: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}
