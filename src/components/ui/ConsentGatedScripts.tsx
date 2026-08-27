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

  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <>
      <Script id="chirps-config" strategy="afterInteractive" nonce={nonce}>
        {`window.chirpsConfig = { assistantId: "e663729e-796a-44d9-98a8-316824eebcb0" };`}
      </Script>
      <Script src="https://digimetrix.ai/embed.js" strategy="afterInteractive" nonce={nonce} />

      {/* Meta Pixel + GA4 — both only render once their env var is actually
          set, so a dev/staging deploy with no pixel configured never sends
          real events to Meta/Google. lib/analytics.ts's trackEvent() is the
          only thing that ever fires events beyond the automatic PageView
          both scripts send on their own. */}
      {metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive" nonce={nonce}>
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${metaPixelId}');
          fbq('track', 'PageView');`}
        </Script>
      )}
      {gaId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" nonce={nonce} />
          <Script id="ga4-init" strategy="afterInteractive" nonce={nonce}>
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');`}
          </Script>
        </>
      )}
    </>
  );
}
