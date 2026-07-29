'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Chirps chatbot widget — only meant to be VISIBLE on the logged-out
// marketing pages (public landing, /trainers, /terms, /privacy), not
// anywhere inside the authenticated app (dashboard, training, etc).
//
// The embed script injects its own floating launcher button/iframe
// directly into <body>, outside React's tree. Unmounting the <Script> tag
// on route change only removes the tag itself — it does NOT undo that
// side effect, so the widget kept showing everywhere after a client-side
// navigation. An earlier version of this file tried to fix that by
// diffing a "before" snapshot of document.body.children against an
// "after" snapshot taken in the script's onLoad callback — but that's
// fundamentally timing-dependent (onReady/onLoad both fire only AFTER the
// script has already run, so a synchronously-injecting widget's node can
// already be in the "before" snapshot, and the diff finds nothing).
//
// A MutationObserver instead watches document.body for any DIRECTLY
// appended child, for as long as the app is open — it doesn't matter
// when the widget injects its DOM, or whether it injects more later
// (e.g. an iframe added after the initial launcher button). This app
// renders straight into <body> (App Router, no #__next wrapper) and has
// no other component that portals into document.body directly (verified:
// no createPortal/ReactDOM.createPortal calls anywhere in the codebase),
// so every node this observer sees is safely assumed to be the widget's.
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

export function ChatWidget() {
  const pathname = usePathname();
  const allowed = ALLOWED_PATHS.includes(pathname);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  const injectedNodesRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            injectedNodesRef.current.push(node);
            node.style.display = allowedRef.current ? '' : 'none';
          }
        });
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    injectedNodesRef.current.forEach((el) => {
      el.style.display = allowed ? '' : 'none';
    });
  }, [allowed]);

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
