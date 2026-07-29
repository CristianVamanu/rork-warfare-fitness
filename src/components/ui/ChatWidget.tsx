'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Chirps chatbot widget — only meant to be VISIBLE on the logged-out
// marketing pages (public landing, /trainers, /terms, /privacy), not
// anywhere inside the authenticated app (dashboard, training, etc).
//
// PRIOR APPROACH #1 (REVERTED — caused a full-site outage): a
// MutationObserver watched document.body for ANY directly-appended child
// and force-hid it outside the allowed paths, assuming the only thing ever
// appended straight to <body> was the widget's own DOM. That assumption
// was wrong and blindly hiding "whatever got added to body" hid real app
// content too — a black screen on every disallowed page.
//
// PRIOR APPROACH #2 (didn't work — wrong selector): tried removing
// `iframe[src*="digimetrix.ai"]`, but inspecting the actual DOM the widget
// creates (confirmed directly in production) showed it's not an iframe at
// all — it's `<div id="chirps-widget-host">` plus a separate full-viewport
// positioning div fingerprinted by inline styles
// (position:fixed;z-index:9999;...;pointer-events:none, no children). The
// selector matched nothing, so the widget kept leaking onto every page.
//
// Fixed for real this time: only inject the widget's script on allowed
// paths (nothing to clean up on the other pages in the common case), and
// a MutationObserver + one-off sweep that ONLY ever touch elements
// matching those two specific, verified fingerprints — never a blanket
// "anything appended to body".
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

function isChirpsWidgetNode(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.id === 'chirps-widget-host') return true;
  return (
    node.tagName === 'DIV' &&
    node.children.length === 0 &&
    node.style.position === 'fixed' &&
    node.style.zIndex === '9999' &&
    node.style.pointerEvents === 'none'
  );
}

function removeChirpsWidgetNodes() {
  document.querySelectorAll('body > *').forEach((el) => {
    if (isChirpsWidgetNode(el)) el.remove();
  });
}

export function ChatWidget() {
  const pathname = usePathname();
  const allowed = ALLOWED_PATHS.includes(pathname);

  useEffect(() => {
    if (allowed) return;
    // Covers the case where the widget's DOM already existed before
    // navigating away from an allowed page.
    removeChirpsWidgetNodes();

    // Covers the case where the embed script is still loading (its
    // request was in flight) at the moment of navigation and creates its
    // DOM slightly after this effect runs — only ever matched against the
    // two specific, verified fingerprints above, so this can't touch
    // anything else in <body> the way the original blanket observer did.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (isChirpsWidgetNode(node)) node.remove();
        });
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
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
