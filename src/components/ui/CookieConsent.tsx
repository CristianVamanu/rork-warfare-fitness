'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export const COOKIE_CONSENT_KEY = 'cookieConsent';
// Fired on every consent change (accept, reject, or reset from Settings) so
// ConsentGatedScripts can mount/unmount the digimetrix widget immediately —
// without this, accepting only took effect after a full page reload, and a
// later "reject" from Settings couldn't un-load an already-running
// third-party script for the rest of the session.
export const COOKIE_CONSENT_EVENT = 'cookieconsentchange';

export type ConsentValue = 'accepted' | 'rejected' | null;

export function getStoredConsent(): ConsentValue {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

function setStoredConsent(value: ConsentValue) {
  try {
    if (value) localStorage.setItem(COOKIE_CONSENT_KEY, value);
    else localStorage.removeItem(COOKIE_CONSENT_KEY);
  } catch {
    // Non-fatal — choice just won't persist across sessions
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }));
}

// Exported so Settings can offer a "Manage cookies" entry that reopens this
// banner to change an earlier choice, instead of it only ever being
// answerable once on first visit.
export function resetCookieConsent() {
  setStoredConsent(null);
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getStoredConsent() === null) setVisible(true);
    const onChange = () => setVisible(getStoredConsent() === null);
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  if (!visible) return null;

  function choose(value: 'accepted' | 'rejected') {
    setStoredConsent(value);
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto bg-surface-elevated border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs text-text-secondary leading-relaxed flex-1">
          We use essential cookies to keep you signed in. With your consent, we also load a
          third-party chat widget that sets its own cookies. See our{' '}
          <Link href="/privacy" className="text-accent underline">Privacy Policy</Link> for details.
          You can change this anytime in Settings.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => choose('rejected')}
            className="bg-surface border border-white/10 text-text-secondary font-semibold text-sm px-4 py-2 rounded-xl hover:text-white hover:border-white/20 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => choose('accepted')}
            className="bg-accent text-black font-semibold text-sm px-5 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
