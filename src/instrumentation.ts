// Next.js instrumentation hook — runs once per server/edge runtime startup,
// before any request is handled. Used here purely to load the matching
// Sentry config for whichever runtime this process actually is.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
