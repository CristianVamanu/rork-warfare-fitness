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
// side effect, so the widget kept showing on every page after a
// client-side navigation until a full reload re-evaluated things from
// scratch. Fixed by keeping the script mounted permanently (it only ever
// loads once) and toggling the visibility of whatever DOM node(s) it
// injected instead, which reacts correctly to every route change.
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

export function ChatWidget() {
  const pathname = usePathname();
  const allowed = ALLOWED_PATHS.includes(pathname);
  const beforeLoadSnapshotRef = useRef<Set<Element>>(new Set());
  const injectedNodesRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    injectedNodesRef.current.forEach((el) => {
      el.style.display = allowed ? '' : 'none';
    });
  }, [allowed, pathname]);

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
        onReady={() => {
          if (beforeLoadSnapshotRef.current.size === 0) {
            beforeLoadSnapshotRef.current = new Set(Array.from(document.body.children));
          }
        }}
        onLoad={() => {
          // Give the widget a moment to actually inject its UI, then diff
          // body children against the pre-load snapshot to find what it
          // added — we don't control/know its internal DOM structure.
          setTimeout(() => {
            const before = beforeLoadSnapshotRef.current;
            const after = Array.from(document.body.children) as HTMLElement[];
            injectedNodesRef.current = after.filter((el) => !before.has(el));
            injectedNodesRef.current.forEach((el) => {
              el.style.display = allowed ? '' : 'none';
            });
          }, 500);
        }}
      />
    </>
  );
}
