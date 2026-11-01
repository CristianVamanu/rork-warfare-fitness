'use client';

/**
 * "Get the app" on the web dashboard: the step MadMuscles-style funnels put
 * right after payment. Points at the store listings the admin has entered in
 * Settings; a store with no URL yet shows no button. Hidden inside the native
 * apps (nothing to get) and after the member dismisses it, for 60 days.
 * Renders nothing when neither store URL is configured.
 */
import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { getSystemConfig } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { nativeBillingBlocked } from '@/lib/native/billing';

const HIDE_KEY = 'wf.getTheApp.hideUntil';
const HIDE_DAYS = 60;

export function GetTheAppCard() {
  const [android, setAndroid] = useState('');
  const [ios, setIos] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (nativeBillingBlocked()) return;
    try { if (Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now()) return; } catch { /* private mode */ }
    let alive = true;
    getSystemConfig().then((cfg) => {
      if (!alive) return;
      const a = (cfg?.androidAppUrl as string | undefined)?.trim() || '';
      const i = (cfg?.iosAppUrl as string | undefined)?.trim() || '';
      setAndroid(a); setIos(i);
      setVisible(!!(a || i));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!visible) return null;

  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch { /* ignore */ }
    setVisible(false);
  };

  // Show the button for the phone in hand first; both when unknown.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIphone = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  // Prefer the store for the phone in hand; if that store has no listing
  // yet, still show whatever exists rather than an empty card.
  let showAndroid = !!android && !isIphone;
  let showIos = !!ios && !isAndroid;
  if (!showAndroid && !showIos) { showAndroid = !!android; showIos = !!ios; }

  return (
    <Card className="p-4 border-accent/25">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Get the app</p>
          <p className="text-xs text-text-secondary mt-0.5">Full screen, faster, reminders that reach you, and your watch&apos;s steps and sleep on the dashboard. Log in with the same email.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {showAndroid && (
              <a href={android} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg bg-accent text-black text-xs font-bold active:scale-95 transition-transform">
                Get it on Google Play
              </a>
            )}
            {showIos && (
              <a href={ios} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg bg-accent text-black text-xs font-bold active:scale-95 transition-transform">
                Download on the App Store
              </a>
            )}
          </div>
        </div>
        <button onClick={hide} aria-label="Dismiss" className="p-1 text-text-tertiary hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
