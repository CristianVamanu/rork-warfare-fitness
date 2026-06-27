'use client';

import { useEffect, useState } from 'react';
import { X, Download, Share } from 'lucide-react';
import { getSystemConfig } from '@/lib/firestore';

// BeforeInstallPromptEvent is non-standard; define a minimal interface
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'pwa_install_snoozed_until';
const SNOOZE_DAYS = 30;

function isSnoozed() {
  const val = localStorage.getItem(SNOOZE_KEY);
  if (!val) return false;
  return Date.now() < parseInt(val, 10);
}

function snooze() {
  const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, String(until));
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [show, setShow] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading

  // Check admin toggle
  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        // default to enabled if not explicitly set to false
        const flag = cfg?.pwaInstallBannerEnabled;
        setEnabled(flag === false ? false : true);
      })
      .catch(() => setEnabled(true));
  }, []);

  useEffect(() => {
    if (enabled === null || enabled === false) return;

    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Already snoozed
    if (isSnoozed()) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(ios);

    if (ios) {
      // Show iOS instructions immediately (no install prompt available)
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }

    // Android / desktop Chrome — wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [enabled]);

  function dismiss() {
    snooze();
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') snooze();
    setShow(false);
    setDeferredPrompt(null);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-surface-elevated border border-white/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-base font-black text-black">W</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Add to Home Screen</p>
            {isIos ? (
              <p className="text-xs text-text-secondary mt-0.5">
                Tap <Share className="w-3 h-3 inline mx-0.5 text-blue-400" /> then &quot;Add to Home Screen&quot; for the full app experience.
              </p>
            ) : (
              <p className="text-xs text-text-secondary mt-0.5">
                Install the app for faster access, offline support, and push notifications.
              </p>
            )}
            {!isIos && (
              <button
                onClick={install}
                className="mt-2 flex items-center gap-1.5 bg-accent text-black text-xs font-bold px-3 py-1.5 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" /> Install App
              </button>
            )}
          </div>
          <button onClick={dismiss} className="text-text-tertiary hover:text-white p-0.5 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
