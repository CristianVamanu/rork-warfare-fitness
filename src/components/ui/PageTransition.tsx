'use client';

/**
 * The wrapper every routed page renders inside.
 *
 * This used to be a framer-motion element with initial opacity 0, which
 * meant EVERY screen in the app shipped its server HTML invisible and
 * stayed that way until framer-motion hydrated. On a mid-range phone that
 * was seconds of a blank app with the content already sitting in the DOM.
 *
 * A CSS class does the same fade-and-rise off the stylesheet, so it starts
 * at first paint and needs no JavaScript at all. This file no longer
 * imports framer-motion, which also takes it off the critical path for
 * every route that only used it for this.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="wf-rise">{children}</div>;
}
