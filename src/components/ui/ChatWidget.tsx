'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Chirps chatbot widget — only meant to be VISIBLE on the logged-out
// marketing pages (public landing, /trainers, /terms, /privacy), not
// anywhere inside the authenticated app (dashboard, training, etc).
//
// PRIOR APPROACH (REVERTED — caused a full-site outage): a MutationObserver
// watched document.body for ANY directly-appended child and force-set
// `display: none` on it outside the allowed paths, on the assumption that
// the only thing ever appended straight to <body> in this app is the
// widget's own DOM. That assumption broke production: whatever the embed
// script appends is not necessarily scoped to just its own launcher/iframe
// — if it wraps or reparents anything broader, blindly hiding "whatever
// got added to body" can hide real app content too, and since this
// component is mounted in the ROOT layout, that manifested as a black
// screen on every page outside the 4 allowed ones, in every browser
// (this was a real DOM-level bug, not a caching/service-worker issue).
//
// Fixed by not injecting the widget's script at all outside the allowed
// paths (so there's nothing of its to hide on the other 90% of the app),
// and only cleaning up its own iframe by matching the widget's own known
// domain — never touching anything else that might be in <body>.
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

export function ChatWidget() {
  const pathname = usePathname();
  const allowed = ALLOWED_PATHS.includes(pathname);

  useEffect(() => {
    if (allowed) return;
    // Client-side nav away from an allowed page: the widget's own iframe
    // may already be in the DOM from before. Only ever remove elements
    // that are provably the widget's own — matched by the exact embed
    // domain — never anything else in <body>.
    document.querySelectorAll('iframe[src*="digimetrix.ai"]').forEach((el) => el.remove());
  }, [allowed]);

  if (!allowed) return null;

  return (
    <>
      {/* Both use the same strategy so Next.js runs them in the order
          they're declared — config must execute before embed.js loads. */}
      <Script id="chirps-config" strategy="afterInteractive">
        {`window.chirpsConfig = { assistantId: "e663729e-796a-44d9-98a8-316824eebcb0" };`}
      </Script>
      <Script src="https://digimetrix.ai/embed.js" strategy="afterInteractive" async />
    </>
  );
}
