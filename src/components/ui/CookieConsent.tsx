'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'cookieConsent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage unavailable (private browsing, etc.) — skip the banner
      // rather than show it every load with no way to actually dismiss it.
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // Non-fatal — banner just won't stay dismissed across sessions
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="max-w-lg mx-auto bg-surface-elevated border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs text-text-secondary leading-relaxed flex-1">
          We use essential cookies to keep you signed in and remember your preferences. See our{' '}
          <Link href="/privacy" className="text-accent underline">Privacy Policy</Link> for details.
        </p>
        <button
          onClick={dismiss}
          className="flex-shrink-0 bg-accent text-black font-semibold text-sm px-5 py-2 rounded-xl hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
