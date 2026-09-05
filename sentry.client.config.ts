// This file configures the initialization of Sentry on the client (browser).
// Only takes effect if NEXT_PUBLIC_SENTRY_DSN is set — no DSN, no init, the
// app runs exactly as before. See the Integrations section of the README
// (or Admin -> Settings) for how to get a DSN.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Performance tracing is OFF, deliberately.
    //
    // browserTracingIntegration instruments Core Web Vitals using a copy of
    // the web-vitals library vendored inside @sentry/browser-utils, and that
    // code throws on this app:
    //
    //   Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
    //     at reportAllChanges
    //
    // getLCP.js reads `entry.startTime` off an entry that can be undefined
    // when the LCP/INP observer fires with no usable entry — which happens on
    // a client-side route change into a view that renders no new largest
    // element, i.e. exactly the tab-to-tab navigation being reported. The
    // throw is inside a requestIdleCallback, so it never breaks the page, but
    // it fills the console with uncaught errors and buries real ones.
    //
    // What was actually wanted here is error monitoring, and that is entirely
    // unaffected: exceptions, stack traces and the Sentry.setUser attribution
    // in AuthContext all still work. Only the performance/vitals half is gone.
    // Turn it back on by removing the integrations filter below, once the
    // upstream getLCP entry guard lands.
    tracesSampleRate: 0,
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== 'BrowserTracing'),
    // Session Replay is off by default (extra ingest volume/cost) — flip
    // these up if you want visual repro of errors, not just stack traces.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
