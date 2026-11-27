'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export const COOKIE_CONSENT_KEY = 'cookieConsent';
// Fired on every consent change (accept, reject, or reset from Settings) so
// ConsentGatedScripts can mount/unmount the analytics scripts immediately —
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

  // A thin bar, not a card. The old card covered the bottom third of a phone
  // screen on the landing page and on the first sign-up question, over the
  // content a new visitor came to see. Reject and Accept stay side by side at
  // the same size, so declining is exactly as easy as accepting.
  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg md:max-w-2xl mx-auto bg-surface-elevated/95 backdrop-blur-md border border-white/10 rounded-xl shadow-xl pl-3 pr-2 py-2 flex items-center gap-2">
        <p className="text-[11px] leading-snug text-text-secondary flex-1 min-w-0">
          Essential cookies only, plus optional analytics.{' '}
          <Link href="/privacy" className="text-accent underline whitespace-nowrap">Privacy</Link>
        </p>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => choose('rejected')}
            className="bg-surface border border-white/10 text-text-secondary font-semibold text-xs px-3 py-1.5 rounded-lg hover:text-white hover:border-white/20 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => choose('accepted')}
            className="bg-accent text-black font-semibold text-xs px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
