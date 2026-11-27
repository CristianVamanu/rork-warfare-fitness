'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getStoredConsent, COOKIE_CONSENT_EVENT } from './CookieConsent';

// Analytics scripts set their own cookies, so they only mount once the user
// has accepted the cookie banner, and un-mount if they later change their
// mind from Settings (see resetCookieConsent / COOKIE_CONSENT_EVENT).
export function ConsentGatedScripts({ nonce }: { nonce?: string }) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(getStoredConsent() === 'accepted');
    const onChange = () => setAccepted(getStoredConsent() === 'accepted');
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  if (!accepted) return null;

  // The Warfare Fitness pixel from Meta Events Manager. A pixel ID is public
  // (it sits in every page's source), so the live one is the default and the
  // env var exists to point a staging build at a different pixel, or to
  // switch the pixel off entirely with NEXT_PUBLIC_META_PIXEL_ID=off.
  const envPixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const metaPixelId = envPixel === 'off' ? '' : (envPixel || '2488600018281880');
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <>
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
