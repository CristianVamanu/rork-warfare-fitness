// This file configures the initialization of Sentry on the client (browser).
// Only takes effect if NEXT_PUBLIC_SENTRY_DSN is set — no DSN, no init, the
// app runs exactly as before. See the Integrations section of the README
// (or Admin -> Settings) for how to get a DSN.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // 10% of sessions traced for performance — enough to spot real trends
    // without the ingest volume (and Sentry-plan cost) of tracing every
    // single page load on a live site.
    tracesSampleRate: 0.1,
    // Session Replay is off by default (extra ingest volume/cost) — flip
    // these up if you want visual repro of errors, not just stack traces.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
