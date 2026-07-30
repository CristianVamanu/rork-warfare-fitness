'use client';

import Script from 'next/script';

// Chirps chatbot widget. Previously this component tried to control which
// pages the widget appeared on from our side (first via a MutationObserver
// that blindly hid anything appended to <body>, which caused a full-site
// outage; then via a narrower DOM-removal approach that still fought with
// React's reconciliation). Both were real production incidents.
//
// The widget itself now has its own "show only on these pages" setting
// configured directly in its dashboard (digimetrix.ai), so none of that is
// this app's responsibility anymore — just load the script globally, the
// same way the vendor's own install instructions describe.
export function ChatWidget() {
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
