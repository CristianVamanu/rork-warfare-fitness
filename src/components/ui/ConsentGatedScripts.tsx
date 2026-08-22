'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getStoredConsent, COOKIE_CONSENT_EVENT } from './CookieConsent';

// The digimetrix chat widget is a third-party script that sets its own
// cookies — it used to load unconditionally on every page regardless of the
// cookie banner's answer, which is exactly the kind of non-essential
// tracking GDPR/UK-GDPR consent is supposed to gate. This only mounts it
// once the user has actually accepted, and un-mounts it immediately if they
// later change their mind from Settings (see resetCookieConsent /
// COOKIE_CONSENT_EVENT).
export function ConsentGatedScripts({ nonce }: { nonce?: string }) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(getStoredConsent() === 'accepted');
    const onChange = () => setAccepted(getStoredConsent() === 'accepted');
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  if (!accepted) return null;

  return (
    <>
      <Script id="chirps-config" strategy="afterInteractive" nonce={nonce}>
        {`window.chirpsConfig = { assistantId: "e663729e-796a-44d9-98a8-316824eebcb0" };`}
      </Script>
      <Script src="https://digimetrix.ai/embed.js" strategy="afterInteractive" nonce={nonce} />
    </>
  );
}
