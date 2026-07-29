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
// side effect. Fixed by keeping the script mounted permanently (it only
// ever loads once) and toggling the visibility of whatever DOM node(s) it
// injected instead, which reacts correctly to every route change.
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

export function ChatWidget() {
  const pathname = usePathname();
  const allowed = ALLOWED_PATHS.includes(pathname);

  // Always holds the CURRENT allowed state, so the setTimeout below (which
  // closes over this ref, not the `allowed` value at the time it was
  // scheduled) applies whichever page the user is actually on by the time
  // it fires — otherwise a fast navigation within that window could leave
  // the widget visible/hidden based on stale state from the previous page.
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  const beforeSnapshotRef = useRef<Set<Element> | null>(null);
  const injectedNodesRef = useRef<HTMLElement[]>([]);

  // Captured on mount, independent of the script's own load lifecycle.
  // next/script's `onReady`/`onLoad` both fire only AFTER the script has
  // already finished loading (and, for a synchronous-injecting widget,
  // after it's already added its DOM) — using either of them for the
  // "before" snapshot, as an earlier version of this file did, captured
  // the widget's own node as already-present, so the diff below never
  // found anything to hide. `strategy="afterInteractive"` defers actually
  // inserting/executing the embed script until after hydration, so this
  // effect (which runs at hydration, independent of that scheduling)
  // reliably captures a true "before" state first.
  useEffect(() => {
    if (!beforeSnapshotRef.current) {
      beforeSnapshotRef.current = new Set(Array.from(document.body.children));
    }
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
      <Script
        src="https://digimetrix.ai/embed.js"
        strategy="afterInteractive"
        async
        onLoad={() => {
          // Give the widget a moment in case it injects its UI
          // asynchronously (e.g. after its own network round-trip) rather
          // than synchronously during initial script execution.
          setTimeout(() => {
            const before = beforeSnapshotRef.current ?? new Set();
            const after = Array.from(document.body.children) as HTMLElement[];
            injectedNodesRef.current = after.filter((el) => !before.has(el));
            injectedNodesRef.current.forEach((el) => {
              el.style.display = allowedRef.current ? '' : 'none';
            });
          }, 500);
        }}
      />
    </>
  );
}
