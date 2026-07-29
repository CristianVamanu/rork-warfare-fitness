'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Chirps chatbot widget — only meant for the logged-out marketing pages
// (public landing, /trainers, /terms, /privacy), not anywhere inside the
// authenticated app (dashboard, training, etc). Gated by pathname here
// rather than in the root layout unconditionally, so navigating into the
// app removes both the config + embed script from the DOM.
const ALLOWED_PATHS = ['/', '/trainers', '/terms', '/privacy'];

export function ChatWidget() {
  const pathname = usePathname();
  if (!ALLOWED_PATHS.includes(pathname)) return null;

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
